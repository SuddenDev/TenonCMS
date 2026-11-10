import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findJobs } from "../../db/queries/jobs/find-jobs.query.ts";
import type { JobFilter } from "../types.ts";
import { canAccessJob } from "./job-access.ts";

/**
 * Lists jobs, only those of tasks the user MAY access. The filter's `limit` applies before the access check.
 */
export async function listJobs(core: Core, user: CmsUser, filter: JobFilter) {
  const jobs = await findJobs(await core.db(), filter);
  const allowed = await Promise.all(jobs.map((job) => canAccessJob(core, user, job)));
  return jobs.filter((_, i) => allowed[i]);
}
