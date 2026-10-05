import { type Db, rowColumns } from "../document-sql.ts";
import { toDoc } from "../../map-document.ts";

/** Drops the draft of a document. Returns the published row. */
export const discardDraft = async (db: Db, collection: string, id: string) =>
  toDoc(
    await db
      .updateTable("cms_documents")
      .set({ draft: null })
      .where("collection", "=", collection)
      .where("id", "=", id)
      .returning(rowColumns(false))
      .executeTakeFirstOrThrow(),
  );
