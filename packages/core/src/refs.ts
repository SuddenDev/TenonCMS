import { type Kysely } from "kysely";
import { existingIds, referencingDocs, referencingGlobal, taken } from "./db/documents.ts";
import type { Database } from "./db/index.ts";
import { ConflictError, ValidationError } from "./errors.ts";
import type { Fields, RelationField, Schema } from "./schema.ts";
import { relationPaths } from "./walk.ts";

// The integrity rules of the document graph: ids MUST exist, unique values MUST NOT collide, and a delete applies `onDelete`.

/** Every id MUST exist in its target collection. One query per relation field. */
export async function checkRefs(
  db: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const value = path.reduce<any>((o, k) => o?.[k], data);
    const ids: string[] = value == null ? [] : field.many ? value : [value];
    const fail = (message: string) => {
      throw new ValidationError({ [path.join(".")]: message });
    };
    if (self && field.collection === self.collection && ids.includes(self.id))
      fail("A document cannot reference itself");
    if (!ids.length) continue;
    const found = await existingIds(db, field.collection, ids);
    if (found.length !== new Set(ids).size) fail(`Unknown id in "${field.collection}"`);
  }
}

// ponytail: one scan per unique field per write. Add SQLite expression indexes if collections grow large.
export async function checkUnique(
  db: Kysely<Database>,
  collection: string,
  fields: Fields,
  data: Record<string, unknown>,
  id?: string,
) {
  const errors: Record<string, string> = {};
  for (const [key, f] of Object.entries(fields)) {
    if (!("unique" in f) || !f.unique || data[key] == null) continue;
    if (await taken(db, collection, key, data[key], id)) errors[key] = "Already used";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

type Ref = {
  collection?: string;
  id?: string;
  global?: string;
  data: Record<string, any>;
  path: string[];
  field: RelationField;
};

const owner = (r: Ref) => (r.global ? `global:${r.global}` : `${r.collection}:${r.id}`);

/** Every document and global that holds `id` in a relation to `collection`. One query per relation field. */
async function references(db: Kysely<Database>, schema: Schema, collection: string, id: string) {
  const refs: Ref[] = [];
  // A document with several matching fields shares one `data` object, so all edits land in one write.
  const parsed = new Map<string, Record<string, any>>();
  const data = (key: string, json: string) =>
    parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)!;
  for (const [name, c] of Object.entries(schema.collections ?? {})) {
    for (const { path, field } of relationPaths(c.fields)) {
      if (field.collection !== collection) continue;
      const rows = await referencingDocs(db, name, path.join("."), field.many, id);
      for (const row of rows)
        refs.push({
          collection: name,
          id: row.id,
          data: data(`${name}:${row.id}`, row.data),
          path,
          field,
        });
    }
  }
  for (const [name, g] of Object.entries(schema.globals ?? {})) {
    for (const { path, field } of relationPaths(g.fields)) {
      if (field.collection !== collection) continue;
      const json = await referencingGlobal(db, name, path.join("."), field.many, id);
      if (json) refs.push({ global: name, data: data(`global:${name}`, json), path, field });
    }
  }
  return refs;
}

/** Local API calls of the current operation, with all their hooks. */
export type Effects = {
  update(collection: string, id: string, data: Record<string, unknown>): Promise<unknown>;
  setGlobal(name: string, data: Record<string, unknown>): Promise<unknown>;
  delete(collection: string, id: string): Promise<unknown>;
};

/**
 * Applies `onDelete` to every reference to a deleted document. MUST run in the delete's transaction, after the row is gone,
 * so a cascade that comes back to it finds nothing and cycles end.
 */
export async function onDelete(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  effects: Effects,
) {
  const refs = await references(db, schema, collection, id);
  const rule = (r: Ref) => r.field.onDelete ?? (r.field.required ? "restrict" : "set-null");
  const blocking = refs.filter((r) => rule(r) === "restrict");
  if (blocking.length) {
    const owners = new Map(blocking.map((r) => [owner(r), r])).values();
    throw new ConflictError(
      [...owners].map((r) =>
        r.global ? { global: r.global } : { collection: r.collection!, id: r.id! },
      ),
    );
  }
  // `set-null` runs before `cascade`: the scanned data is still current then.
  const cleared = refs.filter((r) => rule(r) === "set-null");
  for (const r of cleared) {
    const parent = r.path.slice(0, -1).reduce<any>((o, k) => o?.[k], r.data);
    const key = r.path.at(-1)!;
    parent[key] = r.field.many ? parent[key].filter((x: string) => x !== id) : null;
  }
  for (const r of new Map(cleared.map((r) => [owner(r), r])).values()) {
    if (r.global) await effects.setGlobal(r.global, r.data);
    else await effects.update(r.collection!, r.id!, r.data);
  }
  // Globals cannot cascade (checked at startup), so `collection` and `id` are set.
  for (const r of refs.filter((r) => rule(r) === "cascade"))
    await effects.delete(r.collection!, r.id!);
}
