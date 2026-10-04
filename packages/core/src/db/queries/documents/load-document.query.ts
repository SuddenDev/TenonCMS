import { type Db, docs } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

export async function loadDoc(db: Db, collection: string, id: string, drafts = false) {
  const row = await docs(db, collection, drafts).where("id", "=", id).executeTakeFirst();
  return row && toDoc(row);
}
