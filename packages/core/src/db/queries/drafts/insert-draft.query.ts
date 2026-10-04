import { type Db, type Doc, columns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Inserts a document that was never published, with `draft` as its data. */
export async function insertDraft(db: Db, collection: string, draft: Doc) {
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
      })
      .returning(columns(true))
      .executeTakeFirstOrThrow(),
  );
}
