import type { Db } from "../document-sql.ts";

type NewJob = {
  task: string;
  /** JSON text. */
  payload: string;
  runAt: number;
  maxAttempts: number;
  /** The document or global a scheduled publish belongs to. */
  target?: { key: string; docId: string; locale: string | null };
  createdBy: string | null;
};

/**
 * Inserts a queued job.
 * @returns The id of the job.
 */
export async function insertJob(db: Db, job: NewJob) {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db
    .insertInto("cms_jobs")
    .values({
      id,
      task: job.task,
      payload: job.payload,
      status: "queued",
      run_at: job.runAt,
      attempts: 0,
      max_attempts: job.maxAttempts,
      locked_until: null,
      result: null,
      error: null,
      cron: null,
      target: job.target?.key ?? null,
      doc_id: job.target?.docId ?? null,
      locale: job.target?.locale ?? null,
      created_by: job.createdBy,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}
