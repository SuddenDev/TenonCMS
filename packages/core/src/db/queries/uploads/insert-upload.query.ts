import type { Db, UploadRow } from "../../types.ts";

/** Inserts an upload row. Its key counts as taken until the row goes. */
export async function insertUpload(db: Db, upload: UploadRow) {
  await db.insertInto("cms_uploads").values(upload).execute();
}
