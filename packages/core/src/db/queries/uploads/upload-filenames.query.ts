import type { Db } from "../../types.ts";

/** The filenames of the unfinished uploads into `folder`. */
export async function uploadFilenames(db: Db, folder: string) {
  const rows = await db
    .selectFrom("cms_uploads")
    .select("filename")
    .where("folder", "=", folder)
    .execute();
  return rows.map((row) => row.filename);
}
