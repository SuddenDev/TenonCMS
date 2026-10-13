import { type Database } from "../../db/types.ts";
import { type RefField, type Schema } from "../../schema/index.ts";
import { type Step, relationPaths } from "../../schema/traversal/relation-paths.ts";
import { targetOf } from "../../schema/traversal/reference-fields.ts";
import { referencingDocs } from "../../db/queries/references/referencing-documents.query.ts";
import { referencingGlobal } from "../../db/queries/references/referencing-global.query.ts";
import { referencingLocales } from "../../db/queries/references/referencing-locales.query.ts";
import { DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { localizedKeys } from "../../schema/traversal/localized-fields.ts";
import type { Kysely } from "kysely";

export type Ref = {
  collection?: string;
  id?: string;
  global?: string;
  /** The locale row that holds the reference, for a localized key. */
  locale?: string;
  /** Whether the reference is in the pending draft of the locale row. */
  draft?: boolean;
  data: Record<string, any>;
  path: Step[];
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
 * Identifies the stored JSON that holds a reference: an owner's shared data, one locale row's data or one locale row's draft.
 * @returns A key that is equal for references that share one `data` object.
 */
export function row(r: Ref) {
  return `${owner(r)}${r.locale ? `:${r.locale}` : ""}${r.draft ? ":draft" : ""}`;
}

/**
 * Finds every document and global that holds `id` in a relation to `collection`. One query per relation field.
 * A localized key is searched in the data and the draft of the locale rows, one entry per row, with its `locale`.
 * @returns One entry per matching field. Entries of the same row share one `data` object, so all edits land in one write.
 */
export async function references(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
) {
  const refs: Ref[] = [];
  const parsed = new Map<string, Record<string, any>>();
  const add = (ref: Omit<Ref, "data">, json: string) => {
    const key = row(ref as Ref);
    refs.push({ ...ref, data: parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)! });
  };

  for (const [name, c] of Object.entries(schema.collections ?? {})) {
    const keys = localizedKeys(c);
    for (const { path, field } of relationPaths(c.fields)) {
      if (targetOf(field) !== collection) continue;

      if (keys.includes(path[0] as string)) {
        const found = await referencingLocales(db, DOCUMENT_LOCALES, name, path, field.many, id);
        for (const r of found) {
          const at = { collection: name, id: r.owner, locale: r.locale, path, field };
          if (r.inData) add(at, r.data);
          if (r.inDraft) add({ ...at, draft: true }, r.draft!);
        }
        continue;
      }

      const rows = await referencingDocs(db, name, path, field.many, id);
      for (const r of rows) add({ collection: name, id: r.id, path, field }, r.data);
    }
  }

  for (const [name, g] of Object.entries(schema.globals ?? {})) {
    const keys = localizedKeys(g);
    for (const { path, field } of relationPaths(g.fields)) {
      if (targetOf(field) !== collection) continue;

      if (keys.includes(path[0] as string)) {
        const found = await referencingLocales(db, GLOBAL_LOCALES, name, path, field.many, id);
        for (const r of found) {
          const at = { global: name, locale: r.locale, path, field };
          if (r.inData) add(at, r.data);
          if (r.inDraft) add({ ...at, draft: true }, r.draft!);
        }
        continue;
      }

      const json = await referencingGlobal(db, name, path, field.many, id);
      if (json) add({ global: name, path, field }, json);
    }
  }

  return refs;
}
