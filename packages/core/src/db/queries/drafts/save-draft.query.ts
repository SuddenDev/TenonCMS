import { type Db, type DocData, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Stores the draft of a document. The published data stays. Returns the drafts perspective of the row. */
export const saveDraft = async (db: Db, collection: string, id: string, draft: DocData) =>
  toDoc(
    await db
      .updateTable("cms_documents")
      .set({ draft: JSON.stringify(draft), updated_at: Date.now() })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(rowColumns(true))
      .executeTakeFirstOrThrow(),
  );
