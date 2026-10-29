import { type Db, equals, jsonAt } from "../document-sql.ts";
import { sql } from "kysely";

/**
 * The distinct values of a top-level key in `collection`, e.g. the folders of `media`, among the documents that match
 * `where`: equality filters like those of `findDocs()`. The keys MUST be checked against the schema first.
 * @returns The values, in no order.
 */
export async function distinctValues(
  db: Db,
  collection: string,
  key: string,
  where: Record<string, unknown> = {},
) {
  let query = db
    .selectFrom("cms_documents")
    .select(sql<unknown>`DISTINCT ${jsonAt(db, key)}`.as("value"))
    .where("collection", "=", collection);
  for (const [field, value] of Object.entries(where)) query = query.where(equals(db, field, value));

  const rows = await query.execute();
  return rows.map((r) => r.value);
}
