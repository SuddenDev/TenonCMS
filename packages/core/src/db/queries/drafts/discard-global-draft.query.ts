import { type Db } from "../document-sql.ts";

/** Drops the draft of a global. */
export async function discardGlobalDraft(db: Db, name: string) {
  await db.updateTable("cms_globals").set({ draft: null }).where("name", "=", name).execute();
}
