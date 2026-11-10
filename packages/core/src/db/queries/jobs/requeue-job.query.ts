import type { Db } from "../document-sql.ts";

/**
 * Puts a failed job back in the queue, due now, with all its attempts.
 * @returns Whether the job was failed.
 */
export async function requeueJob(db: Db, id: string, now: number) {
  const { numUpdatedRows } = await db
    .updateTable("cms_jobs")
    .set({ status: "queued", run_at: now, attempts: 0, error: null, updated_at: now })
    .where("id", "=", id)
    .where("status", "=", "failed")
    .executeTakeFirst();
  return numUpdatedRows > 0n;
}
