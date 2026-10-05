import { type Db, type DocData, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Publishes `data`. A pending draft stays, unless `clearDraft`. */
export async function updateDoc(
  db: Db,
  collection: string,
  id: string,
  data: DocData,
  clearDraft = false,
) {
  const now = Date.now();
  return toDoc(
    await db
      .updateTable("cms_documents")
      .set({
        data: JSON.stringify(data),
        updated_at: now,
        published_at: now,
        ...(clearDraft && { draft: null }),
      })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(rowColumns(false))
      .executeTakeFirstOrThrow(),
  );
}
