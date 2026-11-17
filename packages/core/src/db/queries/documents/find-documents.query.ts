import {
  type Loc,
  type Perspective,
  selectDocs,
  jsonAt,
  equals,
  containsText,
} from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import { sql } from "kysely";
import type { Db } from "../../types.ts";

/**
 * Documents of a collection, newest first. `where` and `access` hold equality filters on top-level keys, `createdBy`
 * and `updatedBy`; `null` means `IS NULL`. Both apply, so a `where` cannot widen `access`. The keys MUST be checked
 * against the schema before they get here.
 */
export async function findDocs(
  db: Db,
  collection: string,
  {
    id,
    where = {},
    access = {},
    limit,
    search,
    perspective = "published",
    loc,
  }: {
    id?: string;
    where?: Record<string, unknown>;
    /** The `where` of the read rule. */
    access?: Record<string, unknown>;
    limit?: number;
    search?: { key: string; query: string };
    perspective?: Perspective;
    /** Reads a localized collection in a locale. A filter on a localized key matches the value a read returns. */
    loc?: Loc;
  },
) {
  let query = selectDocs(db, collection, perspective, loc);
  if (id !== undefined) query = query.where("cms_documents.id", "=", id);

  for (const [key, value] of [...Object.entries(where), ...Object.entries(access)])
    if (value !== undefined) query = query.where(equals(db, key, value, perspective, loc));

  if (search)
    query = query.where(containsText(db, jsonAt(db, search.key, perspective, loc), search.query));

  // `rowid` orders documents created in the same millisecond.
  query = query
    .orderBy("cms_documents.created_at", "desc")
    .orderBy(sql`cms_documents.rowid`, "desc");
  if (limit) query = query.limit(limit);

  return (await query.execute()).map((r) => toDoc(r, loc));
}
