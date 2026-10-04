import { type Database } from "../../db/types.ts";
import { type RefField, type Schema } from "../../schema/index.ts";
import { relationPaths, targetOf } from "../../schema/walk.ts";
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

export const owner = (r: Ref) => (r.global ? `global:${r.global}` : `${r.collection}:${r.id}`);

/** Every document and global that holds `id` in a relation to `collection`. One query per relation field. */
export async function references(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
) {
  const refs: Ref[] = [];
  // A document with several matching fields shares one `data` object, so all edits land in one write.
  const parsed = new Map<string, Record<string, any>>();
  const data = (key: string, json: string) =>
    parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)!;
  for (const [name, c] of Object.entries(schema.collections ?? {})) {
    for (const { path, field } of relationPaths(c.fields)) {
      if (targetOf(field) !== collection) continue;
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
      if (targetOf(field) !== collection) continue;
      const json = await referencingGlobal(db, name, path.join("."), field.many, id);
      if (json) refs.push({ global: name, data: data(`global:${name}`, json), path, field });
    }
  }
  return refs;
}
