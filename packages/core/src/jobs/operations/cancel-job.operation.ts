import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { deleteJob } from "../../db/queries/jobs/delete-jobs.query.ts";
import { jobConflict, requireJob } from "./job-access.ts";

/**
 * Deletes a job that is queued, done or failed.
 * @throws {ConflictError} 409 for a running job.
 */
export async function cancelJob(core: Core, user: CmsUser, id: string) {
  const job = await requireJob(core, user, id);
  if (job.status === "running" || !(await deleteJob(await core.db(), id)))
    throw jobConflict("A running job cannot be cancelled");
}
