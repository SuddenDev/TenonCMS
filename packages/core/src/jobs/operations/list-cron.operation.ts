import { Cron } from "croner";
import type { CmsUser } from "../../admin/index.d.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findJobs } from "../../db/queries/jobs/find-jobs.query.ts";
import type { CronEntry } from "../types.ts";
import { canAccessJob } from "./job-access.ts";

/**
 * Lists the cron entries of the tasks the user MAY access, with the next fire time and the last run.
 */
export async function listCron(core: Core, user: CmsUser): Promise<CronEntry[]> {
  const db = await core.db();
  const entries: CronEntry[] = [];

  for (const { cron, task } of core.jobs.scheduled) {
    if (!(await canAccessJob(core, user, { task }))) continue;

    // The seeded slot is queued; the last run is the newest row that is not.
    const rows = await findJobs(db, { cron, task, limit: 10 });
    entries.push({
      pattern: cron,
      task,
      next: new Cron(cron).nextRun()?.toISOString() ?? null,
      last: rows.find((job) => job.status !== "queued") ?? null,
    });
  }
  return entries;
}
