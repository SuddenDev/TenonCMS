import { type Db, type Loc, selectDocs, inIds } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/**
 * The documents of `ids` in `collection` that the perspective sees, in no fixed order.
 * A localized `loc` reads them in a locale.
 */
export async function loadByIds(
  db: Db,
  collection: string,
  ids: string[],
  drafts = false,
  loc?: Loc,
) {
  if (!ids.length) return [];
  return (await selectDocs(db, collection, drafts, loc).where(inIds(ids)).execute()).map((r) =>
    toDoc(r, loc),
  );
}
