import { type Db, type Loc, selectDocs } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** One document, or `undefined` if the perspective does not see it. A localized `loc` reads it in a locale. */
export async function loadDoc(db: Db, collection: string, id: string, drafts = false, loc?: Loc) {
  const row = await selectDocs(db, collection, drafts, loc)
    .where("cms_documents.id", "=", id)
    .executeTakeFirst();
  return row && toDoc(row, loc);
}
