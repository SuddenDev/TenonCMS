import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { claimJob } from "../../db/queries/jobs/claim-job.query.ts";
import { requeueJob } from "../../db/queries/jobs/requeue-job.query.ts";
import { executeJob } from "./execute-job.ts";
import { jobConflict, requireJob } from "./job-access.ts";

/**
 * Puts a failed job back in the queue with all its attempts. The next run picks it up.
 * @returns The queued job.
 * @throws {ConflictError} 409 for a job that is not failed.
 */
export async function retryJob(core: Core, user: CmsUser, id: string) {
  await requireJob(core, user, id);
  const now = Date.now();
  if (!(await requeueJob(await core.db(), id, now)))
    throw jobConflict("Only a failed job can be retried");

  core.jobs.wake(now);
  return requireJob(core, user, id);
}

/**
 * Runs a queued or failed job now, before it is due, and waits for it. A failed job is queued again first, with all
 * its attempts, like a retry.
 * @returns The job after the run.
 * @throws {ConflictError} 409 for a job that is running or done.
 */
export async function runJobNow(core: Core, user: CmsUser, id: string) {
  await requireJob(core, user, id);
  const db = await core.db();
  const now = Date.now();
  await requeueJob(db, id, now);

  const claimed = await claimJob(db, { now, id });
  if (!claimed) throw jobConflict("Only a queued or failed job can run now");

  await executeJob(core, claimed);
  return requireJob(core, user, id);
}
