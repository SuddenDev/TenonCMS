import type { Rule } from "../../access/types.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";
import type { Awaitable } from "../../schema/hooks/index.ts";

/** What a task's `run()` gets. */
export type TaskContext = {
  /** The JSON the job was queued with. */
  payload: unknown;
  /** The server `cms`: no user, no access rules, published reads. `cms.withDrafts()` reads drafts. */
  cms: LocalApi;
  /** `attempts` counts this run. */
  job: { id: string; attempts: number };
};

/**
 * A unit of background work. Jobs for it are queued with `cms.jobs.queue()` or by a cron entry.
 */
export type Task = {
  meta?: { description?: string };
  /**
   * Who sees and manages the task's jobs in the admin: `true`, `false`, a list of roles or a function. Default: admins.
   */
  access?: Rule<{}>;
  /**
   * Does the work. A throw fails the attempt, and the job runs again with a backoff until `maxAttempts`. Delivery is at
   * least once, so the work MUST be safe to repeat. A returned value SHOULD be JSON; it is stored as the job's `result`. A value that is not JSON is dropped with a warning and the job is still done.
   */
  run(context: TaskContext): Awaitable<unknown>;
};

/** The `jobs` option of `defineCms()`. A plugin sets `tasks` and `scheduledTasks` only. */
export type JobsOptions = {
  /** Tasks by name. A name MUST NOT start with `tenon:`. */
  tasks?: Record<string, Task>;
  /** Cron patterns (server time) with the names of the tasks they queue. `{ "0 3 * * *": ["cleanup"] }` */
  scheduledTasks?: Record<string, readonly string[]>;
  /**
   * Opens `GET|POST /_tenon/jobs/run` for callers with `Authorization: Bearer <secret>`, for an external clock such as
   * Vercel Cron. Missing: the route is not mounted. Use `process.env.CRON_SECRET`.
   */
  secret?: string;
};

/** Types a task. */
export const defineTask = (task: Task) => task;
