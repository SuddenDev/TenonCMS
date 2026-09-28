import { type Kysely, sql } from "kysely";
import { isObject } from "./condition.ts";
import { type Database, type Row, toDoc } from "./db/index.ts";
import { ConflictError, ValidationError } from "./errors.ts";
import type { Collection, Field, Fields, Schema } from "./schema.ts";

export type RelationField = Extract<Field, { type: "relation" }>;

/** Every `relation` at the top level and inside groups, with its key path. */
export function relationPaths(
  fields: Fields,
  prefix: string[] = [],
): { path: string[]; field: RelationField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    f.type === "relation"
      ? [{ path: [...prefix, key], field: f }]
      : f.type === "group"
        ? relationPaths(f.fields, [...prefix, key])
        : [],
  );
}

function hasJoin(fields: Fields): boolean {
  return Object.values(fields).some(
    (f) => f.type === "join" || (f.type === "group" && hasJoin(f.fields)),
  );
}

/** Throws when a relation or join does not fit the schema. */
export function checkSchema(schema: Schema, populate: { depth: number; maxDepth: number }) {
  const collections = schema.collections ?? {};
  const fail = (message: string) => {
    throw new Error(`integral-cms: ${message}`);
  };
  if (populate.depth > populate.maxDepth)
    fail(`populate.depth (${populate.depth}) is above populate.maxDepth (${populate.maxDepth})`);
  const owners = [
    ...Object.entries(collections).map(([name, c]) => ({ name, fields: c.fields, global: false })),
    ...Object.entries(schema.globals ?? {}).map(([name, g]) => ({
      name,
      fields: g.fields,
      global: true,
    })),
  ];
  for (const { name, fields, global } of owners) {
    for (const { path, field } of relationPaths(fields)) {
      const at = `relation "${name}.${path.join(".")}"`;
      if (!Object.hasOwn(collections, field.collection))
        fail(`${at} targets unknown collection "${field.collection}"`);
      if (field.required && field.onDelete === "set-null")
        fail(`${at} is required and cannot use onDelete: 'set-null'`);
      if (global && field.onDelete === "cascade")
        fail(`${at} is in a global and cannot use onDelete: 'cascade'`);
    }
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === "group" && hasJoin(f.fields)) fail(`join inside group "${name}.${key}"`);
      if (f.type !== "join") continue;
      if (global) fail(`join "${name}.${key}" in a global`);
      const source = Object.hasOwn(collections, f.collection)
        ? collections[f.collection].fields
        : undefined;
      const target = source && relationPaths(source).find((r) => r.path.join(".") === f.on);
      if (target?.field.collection !== name)
        fail(
          `join "${name}.${key}" needs "${f.on}" to be a relation to "${name}" in "${f.collection}"`,
        );
    }
  }
}

function at(data: any, path: string[]): any {
  return path.reduce((o, k) => o?.[k], data);
}

/** Every id MUST exist in its target collection. One query per relation field. */
export async function checkRefs(
  q: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const value = at(data, path);
    const ids: string[] = value == null ? [] : field.many ? value : [value];
    const fail = (message: string) => {
      throw new ValidationError({ [path.join(".")]: message });
    };
    if (self && field.collection === self.collection && ids.includes(self.id))
      fail("A document cannot reference itself");
    if (!ids.length) continue;
    const found = await q
      .selectFrom("cms_documents")
      .select("id")
      .where("collection", "=", field.collection)
      .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
      .execute();
    if (found.length !== new Set(ids).size) fail(`Unknown id in "${field.collection}"`);
  }
}

/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type Spec = false | number | { [key: string]: true | Spec };

type Docs = Record<string, any>[];

/** Read hooks of the target collection. They get the loaded documents per field per hop, and MAY replace them. */
export type ReadHooks = {
  before(collection: string, docs: Docs): Promise<Docs>;
  after(collection: string, docs: Docs): Promise<Docs>;
};

/** Resolves relation ids in `docs` in place. One query per relation or join field per hop. */
export async function populate(
  q: Kysely<Database>,
  collections: Record<string, Collection>,
  fields: Fields,
  docs: Docs,
  spec: Spec | true,
  read: ReadHooks,
) {
  if (!spec || !docs.length) return;
  for (const [key, field] of Object.entries(fields)) {
    const sub = typeof spec === "object" ? spec[key] : spec;
    if (!sub) continue;
    if (field.type === "group") {
      await populate(
        q,
        collections,
        field.fields,
        docs.map((d) => d[key]).filter(Boolean),
        sub === true ? 1 : sub,
        read,
      );
      continue;
    }
    if (field.type !== "relation" && field.type !== "join") continue;
    // Joins resolve only when named in a populate object.
    if (field.type === "join" && typeof spec !== "object") continue;
    const next = sub === true ? false : typeof sub === "number" ? sub - 1 : sub;
    const target = collections[field.collection].fields;
    // Same order as a top-level read: `beforeRead`, the next hop, `afterRead`.
    const load = async (loaded: Docs) => {
      const before = await read.before(field.collection, loaded);
      await populate(q, collections, target, before, next, read);
      return new Map((await read.after(field.collection, before)).map((d) => [d.id, d]));
    };
    if (field.type === "join") {
      const source = relationPaths(target).find((r) => r.path.join(".") === field.on)!.field;
      const path = `$.${field.on}`;
      const ids = JSON.stringify(docs.map((d) => d.id));
      const query = source.many
        ? sql<
            Row & { ref: string }
          >`SELECT d.*, j.value AS ref FROM cms_documents d, json_each(d.data, ${path}) j
            WHERE d.collection = ${field.collection} AND j.value IN (SELECT value FROM json_each(${ids}))
            ORDER BY d.created_at DESC, d.rowid DESC`
        : sql<
            Row & { ref: string }
          >`SELECT d.*, json_extract(d.data, ${path}) AS ref FROM cms_documents d
            WHERE d.collection = ${field.collection} AND json_extract(d.data, ${path}) IN (SELECT value FROM json_each(${ids}))
            ORDER BY d.created_at DESC, d.rowid DESC`;
      const rows = (await query.execute(q)).rows;
      const byId = await load([...new Map(rows.map((r) => [r.id, toDoc(r)])).values()]);
      for (const d of docs)
        d[key] = rows.filter((r) => r.ref === d.id && byId.has(r.id)).map((r) => byId.get(r.id));
      continue;
    }
    const found = await load(
      await byIds(q, field.collection, [...new Set(docs.flatMap((d) => d[key] ?? []))]),
    );
    for (const d of docs) {
      if (d[key] == null) continue;
      d[key] = field.many
        ? d[key].map((id: string) => found.get(id)).filter(Boolean)
        : (found.get(d[key]) ?? null);
    }
  }
}

async function byIds(q: Kysely<Database>, collection: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await q
    .selectFrom("cms_documents")
    .selectAll()
    .where("collection", "=", collection)
    .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
    .execute();
  return rows.map(toDoc);
}

/** Parses `?populate=` and `?depth=`. Returns the error message for a bad depth, an unknown path, a field that cannot populate or too many hops. */
export function parsePopulate(
  collections: Record<string, Collection>,
  fields: Fields,
  query: { populate?: string; depth?: string },
  config: { depth: number; maxDepth: number },
): Spec | string {
  if (
    query.depth !== undefined &&
    (!/^\d+$/.test(query.depth) || Number(query.depth) > config.maxDepth)
  )
    return `Invalid depth: ${query.depth}`;
  if (query.populate === "false") return false;
  if (query.populate === undefined)
    return query.depth === undefined ? config.depth : Number(query.depth);
  // Null-prototype nodes, like `parseSelect()`. The schema check above each write also rejects `__proto__` today.
  const spec: Record<string, any> = Object.create(null);
  for (const path of query.populate.split(",")) {
    const keys = path.split(".");
    let node = spec;
    let current = fields;
    let hops = 0;
    for (const [i, key] of keys.entries()) {
      const fail = `Invalid populate: ${keys.slice(0, i + 1).join(".")}`;
      const field = Object.hasOwn(current, key) ? current[key] : undefined;
      if (field?.type === "group") current = field.fields;
      else if (field?.type === "relation" || field?.type === "join") {
        if (++hops > config.maxDepth) return fail;
        current = collections[field.collection].fields;
      } else return fail;
      if (i === keys.length - 1) node[key] ??= true;
      else node = node[key] = typeof node[key] === "object" ? node[key] : Object.create(null);
    }
  }
  return spec;
}

/** Keys a read returns. `true` keeps the value; an object lists keys inside a group or a resolved relation or join. */
export type SelectSpec = { [key: string]: true | SelectSpec };

/** `doc` with only the keys in `select`. `id` is kept at every document level (`meta`). Values that are not objects stay as they are. */
export function pick(
  collections: Record<string, Collection>,
  fields: Fields,
  doc: Record<string, any>,
  select: SelectSpec,
  meta = true,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, s] of Object.entries(meta ? { id: true as const, ...select } : select)) {
    if (!Object.hasOwn(doc, key)) continue;
    const value = doc[key];
    const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (s === true || value == null || !f) out[key] = value;
    else if (f.type === "group")
      out[key] = isObject(value) ? pick(collections, f.fields, value, s, false) : value;
    else if (f.type === "relation" || f.type === "join") {
      const target = collections[f.collection].fields;
      const one = (d: unknown) => (isObject(d) ? pick(collections, target, d, s) : d);
      out[key] = Array.isArray(value) ? value.map(one) : one(value);
    } else out[key] = value;
  }
  return out;
}

const META = ["id", "createdAt", "updatedAt"];

/**
 * The first path in `select` that does not fit `fields` and the populate `spec`, or `undefined`. Same resolution rules as `populate()`.
 * `doc`: this level is a document, so `id`, `createdAt` and `updatedAt` exist. Groups and globals have none.
 */
export function checkSelect(
  collections: Record<string, Collection>,
  fields: Fields,
  select: SelectSpec,
  spec: Spec | true,
  prefix = "",
  doc = true,
): string | undefined {
  for (const [key, s] of Object.entries(select)) {
    const path = prefix + key;
    if (doc && s === true && META.includes(key)) continue;
    if (!Object.hasOwn(fields, key) || (s !== true && !isObject(s))) return path;
    if (s === true) continue;
    const f = fields[key];
    const sub = typeof spec === "object" ? spec[key] : spec;
    let error: string | undefined;
    if (f.type === "group")
      error = checkSelect(collections, f.fields, s, sub === true ? 1 : sub, `${path}.`, false);
    else if (f.type === "relation" || f.type === "join") {
      if (!sub || (f.type === "join" && typeof spec !== "object")) return path;
      const next = sub === true ? false : typeof sub === "number" ? sub - 1 : sub;
      error = checkSelect(collections, collections[f.collection].fields, s, next, `${path}.`);
    } else return path;
    if (error) return error;
  }
}

/** Parses `?select=`: dot paths, comma-separated. A longer path wins over its prefix. Keys are checked by `checkSelect()`. */
export function parseSelect(query: string): SelectSpec {
  // Null-prototype nodes, so a `__proto__` segment from the query cannot reach `Object.prototype`.
  const select: Record<string, any> = Object.create(null);
  for (const path of query.split(",").filter(Boolean)) {
    const keys = path.split(".");
    let node = select;
    for (const [i, key] of keys.entries()) {
      if (i === keys.length - 1) node[key] ??= true;
      else node = node[key] = typeof node[key] === "object" ? node[key] : Object.create(null);
    }
  }
  return select;
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
async function references(q: Kysely<Database>, schema: Schema, collection: string, id: string) {
  const refs: Ref[] = [];
  // A document with several matching fields shares one `data` object, so all edits land in one write.
  const parsed = new Map<string, Record<string, any>>();
  const data = (key: string, json: string) =>
    parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)!;
  const match = (path: string[], many?: boolean) => {
    const json = `$.${path.join(".")}`;
    return many
      ? sql<boolean>`EXISTS (SELECT 1 FROM json_each(data, ${json}) WHERE value = ${id})`
      : sql<boolean>`json_extract(data, ${json}) = ${id}`;
  };
  for (const [name, c] of Object.entries(schema.collections ?? {})) {
    for (const { path, field } of relationPaths(c.fields)) {
      if (field.collection !== collection) continue;
      const rows = await q
        .selectFrom("cms_documents")
        .select(["id", "data"])
        .where("collection", "=", name)
        .where(match(path, field.many))
        .execute();
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
      const row = await q
        .selectFrom("cms_globals")
        .select("data")
        .where("name", "=", name)
        .where(match(path, field.many))
        .executeTakeFirst();
      if (row) refs.push({ global: name, data: data(`global:${name}`, row.data), path, field });
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
  q: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  effects: Effects,
) {
  const refs = await references(q, schema, collection, id);
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
    const parent = at(r.data, r.path.slice(0, -1));
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
