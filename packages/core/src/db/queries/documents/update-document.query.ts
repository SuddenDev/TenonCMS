import { type Db, type DocData, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Publishes `data`. A pending draft stays, unless `clearDraft`. `by`: the user id, `null` for server code. */
export async function updateDoc(
  db: Db,
  collection: string,
  id: string,
  data: DocData,
  clearDraft: boolean,
  by: string | null,
) {
  const now = Date.now();
  return toDoc(
    await db
      .updateTable("cms_documents")
      .set({
        data: JSON.stringify(data),
        updated_at: now,
        published_at: now,
        updated_by: by,
        ...(clearDraft && { draft: null }),
      })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(rowColumns(false))
      .executeTakeFirstOrThrow(),
  );
}
