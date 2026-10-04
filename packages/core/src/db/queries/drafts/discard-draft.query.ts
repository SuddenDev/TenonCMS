import { type Db, columns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Drops the draft of a document. Returns the published row. */
export async function discardDraft(db: Db, collection: string, id: string) {
  return toDoc(
    await db
      .updateTable("cms_documents")
      .set({ draft: null })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(columns(false))
      .executeTakeFirstOrThrow(),
  );
}
