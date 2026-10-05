import { type Db, selectDocs } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** One document, or `undefined` if the perspective does not see it. */
export async function loadDoc(db: Db, collection: string, id: string, drafts = false) {
  const row = await selectDocs(db, collection, drafts).where("id", "=", id).executeTakeFirst();
  return row && toDoc(row);
}
