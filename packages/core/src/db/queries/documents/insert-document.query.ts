import { type Db, type Doc, columns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Inserts a published document. */
export async function insertDoc(db: Db, collection: string, data: Doc) {
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
      })
      .returning(columns(false))
      .executeTakeFirstOrThrow(),
  );
}
