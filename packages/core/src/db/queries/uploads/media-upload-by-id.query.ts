import type { Db } from "../../types.ts";

/** The upload `id` outside dot folders, or `undefined`. Dot folders hold import archives, never media. */
export const mediaUploadById = (db: Db, id: string) =>
  db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .where("folder", "not like", ".%")
    .executeTakeFirst();
