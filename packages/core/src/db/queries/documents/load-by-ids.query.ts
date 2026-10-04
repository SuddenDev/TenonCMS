import { type Db, docs, inIds } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

export async function byIds(db: Db, collection: string, ids: string[], drafts = false) {
  if (!ids.length) return [];
  return (await docs(db, collection, drafts).where(inIds(ids)).execute()).map(toDoc);
}
