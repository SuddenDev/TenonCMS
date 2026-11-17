import type { Db } from "../../types.ts";

/** Every upload created before `time`, in milliseconds. */
export const uploadsCreatedBefore = (db: Db, time: number) =>
  db.selectFrom("cms_uploads").selectAll().where("created_at", "<", time).execute();
