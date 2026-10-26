import { type Db, type DocData, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Inserts a document that was never published, with `draft` as its data. `by`: the user id, `null` for server code. */
export async function insertDraft(db: Db, collection: string, draft: DocData, by: string | null) {
  const now = Date.now();
  return toDoc(
    await db
      .insertInto("cms_documents")
      .values({
        id: crypto.randomUUID(),
        collection,
        data: "{}",
        draft: JSON.stringify(draft),
        created_at: now,
        updated_at: now,
        published_at: null,
        created_by: by,
        updated_by: by,
      })
      .returning(rowColumns(true))
      .executeTakeFirstOrThrow(),
  );
}
