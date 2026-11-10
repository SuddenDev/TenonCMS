// This file MUST stay free of runtime imports. The client and the admin import it.

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** A job as `GET /jobs` returns it. Times are ISO strings. */
export type Job = {
  id: string;
  task: string;
  payload: unknown;
  status: JobStatus;
  /** When the job is due. A retry moves it ahead. */
  runAt: string;
  /** How many times a run started. */
  attempts: number;
  maxAttempts: number;
  /** What the task returned, once `done`. */
  result: unknown;
  /** The message of the last failed attempt. */
  error: string | null;
  /** The cron pattern that seeded the job. `null` for a job that cron did not create. */
  cron: string | null;
  /** `collection:<name>` or `global:<name>` for a job that belongs to a document or global. */
  target: string | null;
  /** The document id. `''` for a global. */
  docId: string | null;
  locale: string | null;
  /** Who queued the job. `null` for server code and cron. */
  user: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

/** The query of `GET /jobs`. Every field narrows the list. */
export type JobFilter = {
  id?: string;
  status?: JobStatus;
  task?: string;
  /** `collection:<name>` or `global:<name>`. */
  target?: string;
  /** The document id. `''` for a global. */
  docId?: string;
  /** 1 to 500. */
  limit?: number;
};

/** A cron entry as `GET /jobs/cron` returns it. */
export type CronEntry = {
  pattern: string;
  task: string;
  /** When the pattern fires next, as an ISO string, in server time. `null` for a pattern that never fires again. */
  next: string | null;
  /** The last run that started, `null` before the first one. */
  last: Job | null;
};

/** Options of `cms.jobs.queue()`. */
export type QueueOptions = {
  /** When the job is due. Default: now. */
  runAt?: Date | string | number;
  /** How many runs a failing job gets. Default 3. */
  maxAttempts?: number;
  /**
   * Keeps at most one queued job per task and key: while one waits, queueing again returns its id and changes
   * nothing. Once it runs, the key is free. With a later `runAt`, this collects calls into one run, a debounce with a
   * fixed window.
   */
  key?: string;
  /** With `key`: the new payload of the job that waits, from its payload and the one of this call. JSON in, JSON out. */
  merge?: (queued: unknown, next: unknown) => unknown;
};

/** `cms.jobs` for hooks and server code. */
export type JobsApi = {
  /**
   * Queues a job for a task. Inside a hook it joins the write's transaction, so a rollback removes the job. The task
   * runs once the clock calls `cms.jobs.run()`, at least once. Throws for a task that is not defined.
   * @param payload JSON that the task gets.
   * @returns The id of the job.
   */
  queue(task: string, payload?: unknown, options?: QueueOptions): Promise<{ id: string }>;
};

/** What `cms.jobs.run()` returns. */
export type RunResult = {
  /** How many jobs ran, failed attempts included. */
  ran: number;
  /** When the next queued job is due or the next lease ends, in epoch milliseconds. `null` without one. */
  next: number | null;
};
