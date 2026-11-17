import { type Loc, type Perspective, selectDocs, inIds } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import type { Db } from "../../types.ts";

/**
 * The documents of `ids` in `collection` that the perspective sees, in no fixed order.
 * A localized `loc` reads them in a locale.
 */
export async function loadByIds(
  db: Db,
  collection: string,
  ids: string[],
  perspective: Perspective = "published",
  loc?: Loc,
) {
  if (!ids.length) return [];
  return (await selectDocs(db, collection, perspective, loc).where(inIds(db, ids)).execute()).map(
    (r) => toDoc(r, loc),
  );
}
