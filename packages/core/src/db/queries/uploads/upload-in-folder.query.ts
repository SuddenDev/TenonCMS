import type { Db } from "../../types.ts";

/** The upload `id` in `folder`, or `undefined`. */
export const uploadInFolder = (db: Db, folder: string, id: string) =>
  db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .where("folder", "=", folder)
    .executeTakeFirst();
