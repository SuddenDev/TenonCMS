import { type Database } from "../../db/types.ts";
import { type RefField, type Schema } from "../../schema/index.ts";
import { relationPaths } from "../../schema/traversal/relation-paths.ts";
import { targetOf } from "../../schema/traversal/reference-fields.ts";
import { referencingDocs } from "../../db/queries/references/referencing-documents.query.ts";
import { referencingGlobal } from "../../db/queries/references/referencing-global.query.ts";
import type { Kysely } from "kysely";

export type Ref = {
  collection?: string;
  id?: string;
  global?: string;
  data: Record<string, any>;
  path: string[];
  field: RefField;
};

/**
 * Identifies the document or global that holds a reference.
 * @returns A key that is equal for references of the same owner.
 */
export function owner(r: Ref) {
  return r.global ? `global:${r.global}` : `${r.collection}:${r.id}`;
}

/**
 * Finds every document and global that holds `id` in a relation to `collection`. One query per relation field.
 * @returns One entry per matching field. Entries of the same owner share one `data` object, so all edits land in one write.
 */
export async function references(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
) {
  const refs: Ref[] = [];
  const parsed = new Map<string, Record<string, any>>();
  const data = (key: string, json: string) =>
    parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)!;

  for (const [name, c] of Object.entries(schema.collections ?? {})) {
    for (const { path, field } of relationPaths(c.fields)) {
      if (targetOf(field) !== collection) continue;

      const rows = await referencingDocs(db, name, path.join("."), field.many, id);
      for (const row of rows) {
        const shared = data(`${name}:${row.id}`, row.data);
        refs.push({ collection: name, id: row.id, data: shared, path, field });
      }
    }
  }

  for (const [name, g] of Object.entries(schema.globals ?? {})) {
    for (const { path, field } of relationPaths(g.fields)) {
      if (targetOf(field) !== collection) continue;

      const json = await referencingGlobal(db, name, path.join("."), field.many, id);
      if (json) refs.push({ global: name, data: data(`global:${name}`, json), path, field });
    }
  }

  return refs;
}
