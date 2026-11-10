import { type RawBuilder, sql } from "kysely";
import type { Db } from "../document-sql.ts";
import { iso } from "../../map-document.ts";
import type { JobRow } from "../../types.ts";
import type { Job, JobFilter } from "../../../jobs/types.ts";

type JobWithName = JobRow & { user_name: string | null };

const parse = (json: string | null) => (json === null ? null : JSON.parse(json));

const toJob = (r: JobWithName): Job => ({
  id: r.id,
  task: r.task,
  payload: parse(r.payload),
  status: r.status,
  runAt: iso(r.run_at),
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  result: parse(r.result),
  error: r.error,
  cron: r.cron,
  target: r.target,
  docId: r.doc_id,
  locale: r.locale,
  user: r.created_by === null ? null : { id: r.created_by, name: r.user_name ?? "" },
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

/** Which jobs to list. A missing key adds no condition. `cron`: the pattern of a cron entry's rows. */
type FindJobsFilter = JobFilter & { cron?: string };

/**
 * Lists jobs with the name of the user who queued them. Upcoming and running jobs come in the order they are due;
 * the others newest first.
 */
export async function findJobs(db: Db, filter: FindJobsFilter = {}) {
  const conditions: RawBuilder<unknown>[] = [
    ...(filter.id === undefined ? [] : [sql`j.id = ${filter.id}`]),
    ...(filter.status === undefined ? [] : [sql`j.status = ${filter.status}`]),
    ...(filter.task === undefined ? [] : [sql`j.task = ${filter.task}`]),
    ...(filter.cron === undefined ? [] : [sql`j.cron = ${filter.cron}`]),
    ...(filter.target === undefined ? [] : [sql`j.target = ${filter.target}`]),
    ...(filter.docId === undefined ? [] : [sql`j.doc_id = ${filter.docId}`]),
  ];
  const upcoming = filter.status === "queued" || filter.status === "running";
  const { rows } = await sql<JobWithName>`SELECT j.*, "user".name AS user_name
    FROM cms_jobs j LEFT JOIN "user" ON "user".id = j.created_by
    WHERE ${conditions.length ? sql.join(conditions, sql` AND `) : sql`TRUE`}
    ORDER BY ${upcoming ? sql`j.run_at ASC, j.rowid ASC` : sql`j.updated_at DESC, j.rowid DESC`}
    LIMIT ${filter.limit ?? 200}`.execute(db);
  return rows.map(toJob);
}
