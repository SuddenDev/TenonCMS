import { type Db, type Loc, selectDocs, jsonAt } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";
import { sql } from "kysely";

/**
 * Documents of a collection, newest first. `where` holds equality filters on top-level keys; `null` means `IS NULL`.
 * The keys MUST be checked against the schema before they get here.
 */
export async function findDocs(
  db: Db,
  collection: string,
  {
    id,
    where = {},
    limit,
    search,
    drafts = false,
    loc,
  }: {
    id?: string;
    where?: Record<string, unknown>;
    limit?: number;
    search?: { key: string; query: string };
    drafts?: boolean;
    /** Reads a localized collection in a locale. A filter on a localized key matches the value a read returns. */
    loc?: Loc;
  },
) {
  let query = selectDocs(db, collection, drafts, loc);
  if (id !== undefined) query = query.where("cms_documents.id", "=", id);

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    const field = jsonAt(key, drafts, loc);
    query = query.where(
      value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`,
    );
  }

  if (search)
    query = query.where(
      sql<boolean>`instr(lower(CAST(${jsonAt(search.key, drafts, loc)} AS TEXT)), lower(${search.query})) > 0`,
    );

  // `rowid` orders documents created in the same millisecond.
  query = query
    .orderBy("cms_documents.created_at", "desc")
    .orderBy(sql`cms_documents.rowid`, "desc");
  if (limit) query = query.limit(limit);

  return (await query.execute()).map((r) => toDoc(r, loc));
}
