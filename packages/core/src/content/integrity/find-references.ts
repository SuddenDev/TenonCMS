import { type Database } from "../../db/types.ts";
import { type Fields, type RefField, type Schema } from "../../schema/index.ts";
import { type Step, relationPaths } from "../../schema/traversal/relation-paths.ts";
import { isRef, targetOf } from "../../schema/traversal/reference-fields.ts";
import { nestsItself } from "../../schema/traversal/blocks-of.ts";
import { eachField } from "../../schema/traversal/each-field.ts";
import { referencingDocs } from "../../db/queries/references/referencing-documents.query.ts";
import { referencingGlobal } from "../../db/queries/references/referencing-global.query.ts";
import { referencingLocales } from "../../db/queries/references/referencing-locales.query.ts";
import {
  DOCUMENT_LOCALES,
  GLOBAL_LOCALES,
  type Holds,
  containsText,
  holdsAt,
} from "../../db/queries/document-sql.ts";
import { localizedKeys } from "../../schema/traversal/localized-fields.ts";
import { type Kysely, sql } from "kysely";

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
 * Finds every document and global that holds `id` in a relation to `collection`. One query per relation field, or
 * one per owner where a block contains itself (see {@link scansOf}).
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
  const add = async (scan: Scan, at: Omit<Ref, "data" | "path" | "field">, json: string) => {
    const key = row(at as Ref);
    const data = parsed.get(key) ?? parsed.set(key, JSON.parse(json)).get(key)!;
    for (const found of await scan.found(data)) refs.push({ ...at, ...found, data });
  };

  for (const [name, c] of Object.entries(schema.collections ?? {}))
    for (const scan of scansOf(db, c.fields, localizedKeys(c), collection, id)) {
      if (scan.localized)
        for (const r of await referencingLocales(db, DOCUMENT_LOCALES, name, scan.holds)) {
          const at = { collection: name, id: r.owner, locale: r.locale };
          if (r.inData) await add(scan, at, r.data);
          if (r.inDraft) await add(scan, { ...at, draft: true }, r.draft!);
        }
      if (scan.shared)
        for (const r of await referencingDocs(db, name, scan.holds))
          await add(scan, { collection: name, id: r.id }, r.data);
    }

  for (const [name, g] of Object.entries(schema.globals ?? {}))
    for (const scan of scansOf(db, g.fields, localizedKeys(g), collection, id)) {
      if (scan.localized)
        for (const r of await referencingLocales(db, GLOBAL_LOCALES, name, scan.holds)) {
          const at = { global: name, locale: r.locale };
          if (r.inData) await add(scan, at, r.data);
          if (r.inDraft) await add(scan, { ...at, draft: true }, r.draft!);
        }
      if (scan.shared) {
        const json = await referencingGlobal(db, name, scan.holds);
        if (json) await add(scan, { global: name }, json);
      }
    }

  return refs;
}

/** One search of an owner's rows: which rows match, which kinds of rows, and the references in a row that matches. */
type Scan = {
  holds: Holds;
  /** Whether the locale rows are searched. */
  localized: boolean;
  /** Whether the shared row is searched. */
  shared: boolean;
  found(data: Record<string, any>): Promise<Pick<Ref, "path" | "field">[]>;
};

/**
 * The searches for references to `id` in one owner: one per relation field to `collection`. Where a block contains
 * itself, no list of paths reaches every item. One search then finds the rows whose JSON contains the id, and a walk
 * over each row finds the fields that hold it, with positional paths.
 */
function scansOf(
  db: Kysely<Database>,
  fields: Fields,
  keys: readonly string[],
  collection: string,
  id: string,
): Scan[] {
  if (nestsItself(fields)) {
    const quoted = JSON.stringify(id);
    return [
      {
        holds: (column) => containsText(db, sql.ref(column), quoted),
        localized: keys.length > 0,
        shared: true,
        found: (data) => referencesIn(fields, data, collection, id),
      },
    ];
  }
  return relationPaths(fields)
    .filter(({ field }) => targetOf(field) === collection)
    .map(({ path, field }) => {
      const localized = keys.includes(path[0] as string);
      return {
        holds: (column) => holdsAt(db, column, path, field.many, id),
        localized,
        shared: !localized,
        found: async () => [{ path, field }],
      };
    });
}

/** The reference fields to `collection` that hold `id` in `data`, at any depth. */
async function referencesIn(
  fields: Fields,
  data: Record<string, any>,
  collection: string,
  id: string,
) {
  const found: Pick<Ref, "path" | "field">[] = [];
  await eachField(fields, data, (key, f, holder, at) => {
    if (!isRef(f) || targetOf(f) !== collection) return;
    const value = holder[key];
    if (f.many ? Array.isArray(value) && value.includes(id) : value === id)
      found.push({ path: at.split("."), field: f });
  });
  return found;
}
