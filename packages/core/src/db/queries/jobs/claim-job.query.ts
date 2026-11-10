import { type ExpressionBuilder, sql } from "kysely";
import type { Database, JobRow } from "../../types.ts";
import { type Db, isPostgres } from "../document-sql.ts";

// ponytail: a task longer than the lease can run twice. Delivery is at least once. Renew the lease while a task runs
// if that ever matters.
const LEASE = 5 * 60_000;

// A queued job that is due, or a running one whose lease ended. With `id`, a queued job is claimable before it is due.
const claimable = (eb: ExpressionBuilder<Database, "cms_jobs">, now: number, id?: string) => {
  const open = eb.or([
    id
      ? eb("status", "=", "queued")
      : eb.and([eb("status", "=", "queued"), eb("run_at", "<=", now)]),
    eb.and([eb("status", "=", "running"), eb("locked_until", "<", now)]),
  ]);
  return id ? eb.and([eb("id", "=", id), open]) : open;
};

/**
 * Claims the oldest claimable job, or job `id` for "Run now". One statement, so two runners cannot claim the same
 * job: SQLite serializes writers, Postgres skips a row another transaction holds (`FOR UPDATE SKIP LOCKED`). The claim
 * counts an attempt and leases the job for five minutes.
 * @returns The claimed row, or `undefined` when nothing is claimable.
 */
export function claimJob(db: Db, { now, id }: { now: number; id?: string }) {
  return db
    .updateTable("cms_jobs")
    .set((eb) => ({
      status: "running",
      locked_until: now + LEASE,
      attempts: eb("attempts", "+", 1),
      updated_at: now,
    }))
    .where((eb) => {
      let next = eb
        .selectFrom("cms_jobs")
        .select("id")
        .where((e) => claimable(e, now, id))
        .orderBy("run_at")
        .orderBy(sql`rowid`)
        .limit(1);
      if (isPostgres(db)) next = next.forUpdate().skipLocked();
      return eb.and([eb("id", "=", next), claimable(eb, now, id)]);
    })
    .returningAll()
    .executeTakeFirst() as Promise<JobRow | undefined>;
}
