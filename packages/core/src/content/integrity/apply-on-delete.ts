import { type Database } from "../../db/types.ts";
import { type Schema } from "../../schema/index.ts";
import { ConflictError } from "../../errors.ts";
import { type Ref, owner, references, row } from "./find-references.ts";
import { DOCUMENT_LOCALES, GLOBAL_LOCALES } from "../../db/queries/document-sql.ts";
import { holdersAt } from "../../schema/traversal/holders-at.ts";
import { saveLocaleDraft } from "../../db/queries/locales/save-locale-draft.query.ts";
import type { Kysely } from "kysely";

/** Local API calls of the current operation, with all their hooks. A `locale` writes that locale's row. */
export type Effects = {
  update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    locale?: string,
  ): Promise<unknown>;
  setGlobal(name: string, data: Record<string, unknown>, locale?: string): Promise<unknown>;
  delete(collection: string, id: string): Promise<unknown>;
};

/**
 * Applies `onDelete` to every reference to a deleted document. MUST run in the delete's transaction, after the row is gone,
 * so a cascade that comes back to it finds nothing and cycles end.
 *
 * @throws {ConflictError} When a `restrict` reference points to the document. Nothing is changed then.
 */
export async function onDelete(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  effects: Effects,
) {
  const refs = await references(db, schema, collection, id);

  const blocking = refs.filter((r) => rule(r) === "restrict");
  if (blocking.length) throw conflict(blocking);

  // `set-null` runs before `cascade`: the scanned data is still current then.
  const cleared = refs.filter((r) => rule(r) === "set-null");
  await clear(db, cleared, id, effects);

  // Globals cannot cascade (checked at startup), so `collection` and `id` are set.
  const cascading = refs.filter((r) => rule(r) === "cascade");
  for (const r of new Map(cascading.map((r) => [owner(r), r])).values())
    await effects.delete(r.collection!, r.id!);
}

// `image` and `file` restrict by default; relations only when required.
function rule(r: Ref) {
  return (
    r.field.onDelete ?? (r.field.required || r.field.type !== "relation" ? "restrict" : "set-null")
  );
}

function conflict(blocking: Ref[]) {
  const owners = new Map(blocking.map((r) => [owner(r), r])).values();
  return new ConflictError(
    [...owners].map((r) =>
      r.global ? { global: r.global } : { collection: r.collection!, id: r.id! },
    ),
  );
}

// References of one stored row share one `data` object, so each row is written once with all its edits.
// Every item that holds the id is cleared; the items stay.
// A pending draft of a locale row is rewritten without hooks, as a draft save runs none of the write checks.
async function clear(db: Kysely<Database>, refs: Ref[], id: string, effects: Effects) {
  for (const r of refs)
    for (const { parent, key } of holdersAt(r.data, r.path)) {
      const value = parent[key];
      if (r.field.many && Array.isArray(value)) parent[key] = value.filter((x) => x !== id);
      else if (value === id) parent[key] = null;
    }

  for (const r of new Map(refs.map((r) => [row(r), r])).values()) {
    if (r.draft) {
      const locales = r.global ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
      await saveLocaleDraft(db, locales, r.global ?? r.id!, r.locale!, r.data);
    } else if (r.global) await effects.setGlobal(r.global, r.data, r.locale);
    else await effects.update(r.collection!, r.id!, r.data, r.locale);
  }
}
