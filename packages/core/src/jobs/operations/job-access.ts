import { scheduleTasks } from "../../schedule/tasks.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { check, decide, guard } from "../../access/rule.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import type { Core, Inner } from "../../cms/runtime/types.ts";
import { type ContentTarget, hasTarget, targetOfKey } from "../../content/targets.ts";
import { ConflictError, ForbiddenError } from "../../errors.ts";
import { notFound } from "../../http/errors.ts";
import { findJobs } from "../../db/queries/jobs/find-jobs.query.ts";
import type { Job } from "../types.ts";

/** The parts of a job that decide who MAY see it. */
type JobOwner = {
  task: string;
  target?: Job["target"];
  docId?: Job["docId"];
  locale?: Job["locale"];
};

/**
 * Whether the user MAY see and manage the job. A job of a document or global follows the `update` rule of that target,
 * with the document id. Any other job follows the `access` rule of its task, admins only without one. A job whose
 * target left the schema counts as any other job.
 */
export async function canAccessJob(core: Core, user: CmsUser, job: JobOwner) {
  const s = inner(
    core,
    { ...outerScope({ user }), locale: job.locale ?? undefined },
    undefined,
    {},
  );
  const name = job.target ? targetOfKey(job.target) : undefined;
  if (name && hasTarget(core, name)) return canUpdate(core, s, name, job.docId || undefined);
  return isTaskAllowed(core, s, job.task);
}

/**
 * The tasks the caller of `s` MAY see, for the `/schema` of the admin. The built-in tasks (`tenon:`) belong to
 * documents and have no rule of their own: they show when the caller MAY update an entry with `schedule`.
 * @returns `name` and `description` of each task.
 */
export async function visibleTasks(core: Core, s: Inner) {
  const entries = [
    ...Object.entries(core.schema.collections).map(([name, e]) => [name, e, "collection"] as const),
    ...Object.entries(core.schema.globals).map(([name, e]) => [name, e, "global"] as const),
  ];
  let scheduling = false;
  for (const [name, entry, kind] of entries)
    if (entry.schedule && (await decide(core, s, { kind, name }, "update"))) {
      scheduling = true;
      break;
    }

  const tasks: Array<{ name: string; description: string }> = [];
  for (const [name, task] of core.jobs.tasks) {
    const allowed = name in scheduleTasks ? scheduling : await isTaskAllowed(core, s, name);
    if (allowed) tasks.push({ name, description: task.meta?.description ?? "" });
  }
  return tasks;
}

/**
 * Loads a job the user MAY manage.
 * @throws {HTTPException} 404 for a missing job.
 * @throws {ForbiddenError} 403 when the job's rule denies the user.
 */
export async function requireJob(core: Core, user: CmsUser, id: string) {
  const [job] = await findJobs(await core.db(), { id });
  if (!job) throw notFound();
  if (!(await canAccessJob(core, user, job))) throw new ForbiddenError(403);
  return job;
}

/** The error of an action that the job's state does not allow. */
export const jobConflict = (message: string) => new ConflictError([], message);

/** Whether the `access` rule of the task allows the caller of `s`. */
async function isTaskAllowed(core: Core, s: Inner, task: string) {
  const rule = core.jobs.tasks.get(task)?.access ?? ["admin"];
  return !!(await check(s, rule, { cms: s.cms, user: s.user, context: s.context }));
}

/** Whether the `update` rule of the target allows the caller of `s`, for one document when `id` is set. */
async function canUpdate(core: Core, s: Inner, name: ContentTarget, id?: string) {
  try {
    await guard(core, s, name, "update", { id });
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}
