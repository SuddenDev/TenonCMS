import { type Db, type Doc } from "../document-sql.ts";

/** Stores the draft of a global. A global that was never saved gets an unpublished row. */
export async function saveGlobalDraft(db: Db, name: string, draft: Doc) {
  const now = Date.now();
  const json = JSON.stringify(draft);
  await db
    .insertInto("cms_globals")
    .values({ name, data: "{}", draft: json, created_at: now, updated_at: now, published_at: null })
    .onConflict((oc) => oc.column("name").doUpdateSet({ draft: json, updated_at: now }))
    .execute();
}
