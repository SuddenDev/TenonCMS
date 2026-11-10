import type { Core } from "../../cms/runtime/types.ts";
import { claimJob } from "../../db/queries/jobs/claim-job.query.ts";
import { deleteDoneJobs } from "../../db/queries/jobs/delete-jobs.query.ts";
import { nextJobTime } from "../../db/queries/jobs/next-job-time.query.ts";
import type { RunResult } from "../types.ts";
import { executeJob } from "./execute-job.ts";
import { seedCron } from "./seed-cron.operation.ts";

const BATCH = 100;
const RETENTION = 30 * 24 * 3_600_000;

/**
 * One tick of the clock: seeds the cron slots, runs the due jobs one after another, up to 100, and deletes done jobs
 * older than 30 days.
 * Any number of callers MAY run at once; each job runs for one of them. MUST NOT run inside a hook: a hook's open
 * transaction blocks a single-connection database.
 */
export async function runJobs(core: Core): Promise<RunResult> {
  const db = await core.db();
  await seedCron(core, db, Date.now());

  let ran = 0;
  while (ran < BATCH) {
    const job = await claimJob(db, { now: Date.now() });
    if (!job) break;
    await executeJob(core, job);
    ran++;
  }

  await deleteDoneJobs(db, Date.now() - RETENTION);
  return { ran, next: await nextJobTime(db) };
}
