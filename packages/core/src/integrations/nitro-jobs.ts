/** Name of the Nitro task that ticks the job queue. */
export const JOBS_TASK = "tenon:jobs";

const JOBS_CRON = "* * * * *";

type ScheduledTasks = Record<string, string | (string | undefined)[] | undefined>;

/**
 * Adds the jobs task to the every-minute entry of Nitro's `scheduledTasks`. Entries of the host stay as they are.
 * @returns The same object when the entry already has the task.
 */
export function withJobsTask(scheduledTasks: ScheduledTasks = {}): ScheduledTasks {
  const tasks = [scheduledTasks[JOBS_CRON] ?? []].flat().filter((task) => task !== undefined);
  if (tasks.includes(JOBS_TASK)) return scheduledTasks;
  return { ...scheduledTasks, [JOBS_CRON]: [...tasks, JOBS_TASK] };
}
