import { type Db, type DocData, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Inserts a published document. `by`: the user id, `null` for server code. */
export async function insertDoc(db: Db, collection: string, data: DocData, by: string | null) {
  const now = Date.now();
  return toDoc(
    await db
      .insertInto("cms_documents")
      .values({
        id: crypto.randomUUID(),
        collection,
        data: JSON.stringify(data),
        created_at: now,
        updated_at: now,
        published_at: now,
        created_by: by,
        updated_by: by,
      })
      .returning(rowColumns(false))
      .executeTakeFirstOrThrow(),
  );
}
