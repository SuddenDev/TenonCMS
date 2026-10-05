import { type Db, selectDocs, inIds } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** The documents of `ids` in `collection` that the perspective sees, in no fixed order. */
export async function loadByIds(db: Db, collection: string, ids: string[], drafts = false) {
  if (!ids.length) return [];
  return (await selectDocs(db, collection, drafts).where(inIds(ids)).execute()).map(toDoc);
}
