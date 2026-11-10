import type { Db } from "../document-sql.ts";
import type { JobRow } from "../../types.ts";

/**
 * Deletes a job that is not running.
 * @returns Whether a job was deleted.
 */
export async function deleteJob(db: Db, id: string) {
  const { numDeletedRows } = await db
    .deleteFrom("cms_jobs")
    .where("id", "=", id)
    .where("status", "<>", "running")
    .executeTakeFirst();
  return numDeletedRows > 0n;
}

/**
 * Deletes done jobs last changed before `before`. Failed jobs stay until someone retries or cancels them. Cron rows
 * stay too: an entry keeps its last run, however long ago it was.
 */
export async function deleteDoneJobs(db: Db, before: number) {
  await db
    .deleteFrom("cms_jobs")
    .where("status", "=", "done")
    .where("cron", "is", null)
    .where("updated_at", "<", before)
    .execute();
}

/** Deletes the cron rows that are not running and whose `(cron, task)` is not one of `entries`. */
export async function deleteStaleCronJobs(db: Db, entries: Array<{ cron: string; task: string }>) {
  await db
    .deleteFrom("cms_jobs")
    .where("cron", "is not", null)
    .where("status", "<>", "running")
    .where((eb) =>
      eb.and(
        entries.map((e) => eb.not(eb.and([eb("cron", "=", e.cron), eb("task", "=", e.task)]))),
      ),
    )
    .execute();
}

/** Deletes the finished runs of the job's cron entry that are older than the job. */
export async function deleteOlderCronRuns(db: Db, job: Pick<JobRow, "cron" | "task" | "run_at">) {
  if (job.cron === null) return;
  await db
    .deleteFrom("cms_jobs")
    .where("cron", "=", job.cron)
    .where("task", "=", job.task)
    .where("status", "in", ["done", "failed"])
    .where("run_at", "<", job.run_at)
    .execute();
}

/** Deletes the queued jobs of `task` that belong to one document or global in one locale. */
export async function deleteQueuedTargetJobs(
  db: Db,
  task: string,
  target: { key: string; docId: string; locale: string | null },
) {
  await db
    .deleteFrom("cms_jobs")
    .where("task", "=", task)
    .where("status", "=", "queued")
    .where("target", "=", target.key)
    .where("doc_id", "=", target.docId)
    .where("locale", target.locale === null ? "is" : "=", target.locale)
    .execute();
}
