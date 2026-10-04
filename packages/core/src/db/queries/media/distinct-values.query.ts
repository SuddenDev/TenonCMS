import { type Db, json } from "../document-sql.ts";
import { sql } from "kysely";

/** The distinct values of a top-level key in `collection`, e.g. the folders of `media`. */
export async function distinct(db: Db, collection: string, key: string) {
  const rows = await db
    .selectFrom("cms_documents")
    .select(sql<unknown>`DISTINCT ${json(key)}`.as("value"))
    .where("collection", "=", collection)
    .execute();
  return rows.map((r) => r.value);
}
