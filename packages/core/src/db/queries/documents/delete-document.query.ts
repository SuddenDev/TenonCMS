import { type Db } from "../document-sql.ts";

/** Deletes a document row. */
export async function deleteDoc(db: Db, collection: string, id: string) {
  await db
    .deleteFrom("cms_documents")
    .where("collection", "=", collection)
    .where("id", "=", id)
    .execute();
}
