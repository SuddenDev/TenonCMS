import { type Db, docs, json } from "../document-sql.ts";
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
    drafts = false,
  }: { id?: string; where?: Record<string, unknown>; limit?: number; drafts?: boolean },
) {
  let query = docs(db, collection, drafts);
  if (id !== undefined) query = query.where("id", "=", id);
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    const field = json(key, drafts);
    query = query.where(
      value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`,
    );
  }
  // `rowid` orders documents created in the same millisecond.
  query = query.orderBy("created_at", "desc").orderBy(sql`rowid`, "desc");
  if (limit) query = query.limit(limit);
  return (await query.execute()).map(toDoc);
}
