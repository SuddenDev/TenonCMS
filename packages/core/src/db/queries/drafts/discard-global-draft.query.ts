import { type Db } from "../document-sql.ts";

export async function discardGlobalDraft(db: Db, name: string) {
  await db.updateTable("cms_globals").set({ draft: null }).where("name", "=", name).execute();
}
