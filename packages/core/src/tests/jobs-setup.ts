import { vi } from "vitest";
import type { JobsOptions } from "../jobs/index.ts";
import { defineCms, defineTask } from "../index.ts";
import { base, testDatabase, testDb } from "./setup.ts";

/** Payloads of each `greet` run. Empty it after each test. */
export const calls: Array<{ payload: unknown; id: string }> = [];
export const greet = defineTask({
  run: ({ payload, job }) => {
    calls.push({ payload, id: job.id });
    return { greeted: payload };
  },
});
export const boom = defineTask({
  run: () => {
    throw new Error("nope");
  },
});

/** An instance with the tasks `greet` and `boom`, plus those of `jobs`. */
export const jobsCms = (jobs: JobsOptions = {}, database = testDatabase()) =>
  defineCms({
    ...base,
    database,
    jobs: { ...jobs, tasks: { greet, boom, ...jobs.tasks } },
  });

export type JobRow = {
  id: string;
  task: string;
  status: string;
  attempts: number;
  run_at: number;
  locked_until: number | null;
  result: string | null;
  error: string | null;
};
export const SELECT = `SELECT id, task, status, attempts, run_at, locked_until, result, error FROM cms_jobs ORDER BY created_at, run_at`;

/** An instance on a file database with `exec()` for raw SQL, already migrated. */
export async function onFile(jobs: JobsOptions = {}) {
  const { database, exec } = testDb();
  const cms = jobsCms(jobs, database);
  await cms.jobs.run();
  return { cms, database, exec, rows: () => exec(SELECT) as Promise<JobRow[]> };
}

/** Restores real timers and empties `calls`. */
export function resetJobs() {
  vi.useRealTimers();
  calls.length = 0;
}
