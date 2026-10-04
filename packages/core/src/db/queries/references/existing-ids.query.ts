import { type Db, inIds } from "../document-sql.ts";

/** The ids of `ids` that exist in `collection`. Any row counts, published or not. */
export async function existingIds(db: Db, collection: string, ids: string[]) {
  const rows = await db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(inIds(ids))
    .execute();
  return rows.map((r) => r.id);
}
