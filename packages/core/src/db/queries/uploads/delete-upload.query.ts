import type { Db } from "../../types.ts";

/** Deletes the upload row `id`. */
export async function deleteUpload(db: Db, id: string) {
  await db.deleteFrom("cms_uploads").where("id", "=", id).execute();
}
