# jobs

Background work in the host app: a job queue in our own table (`cms_jobs`) and a clock that runs the due jobs. Tasks are code (`defineTask`), jobs are rows. The module has no timer of its own: whoever owns a clock (a host trigger, an interval, a Durable Object alarm, an external pinger) calls `cms.jobs.run()` or `/_tenon/jobs/run`. The adapters start the clocks, see [integrations](../integrations/README.md#job-clock).

## Follow a job

`cms.jobs.queue("greet", payload)` flows through:

`api.ts` → `operations/queue.operation.ts` → `db/queries/jobs/insert-job.query.ts`

Inside a hook the insert uses the transaction of the write (`databaseForScope()`), so a rollback removes the job, and the clock wakes through `afterCommit()` (`core.jobs.wake(at)`). Outside a transaction it inserts on `core.db()` and wakes at once.

With `key`, `findKeyedJob()` first looks for the oldest queued job of the task under that key (`FOR UPDATE` on Postgres, so a runner skips it until the write commits). One that waits wins: `queue()` returns its id, writes `merge(queued, next)` as its payload when `merge` is set, and inserts nothing. Two concurrent first calls on Postgres both insert; the key saves work and guarantees nothing.

`cms.jobs.run()` flows through:

`operations/run-jobs.operation.ts` → `db/queries/jobs/claim-job.query.ts` → `operations/execute-job.ts` → `db/queries/jobs/finish-job.query.ts`

A tick claims and runs due jobs one after another, up to 100, deletes done jobs older than 30 days, and returns `{ ran, next }`. `next` is when the next job is due, so a host with an alarm re-arms at it.

## Claim

One `UPDATE … WHERE id = (SELECT … LIMIT 1) RETURNING *` takes the oldest due job (`run_at <= now`, `rowid` breaks ties), or a running job whose lease ended. It counts an attempt and leases the job for five minutes.

- SQLite (libsql, `node:sqlite`, Durable Object): writers are serialized, so the statement is atomic.
- Postgres and PGlite: the subquery adds `FOR UPDATE SKIP LOCKED`, so a second runner skips a row the first holds.
- Delivery is at least once. A task that runs longer than the lease can run twice.
- A job whose lease ended on its last attempt fails without running. Otherwise a task that kills its host would loop.

`execute-job.ts` runs the task with the server `cms` (no user, no access rules). A result that is not JSON (a `BigInt`, a circular object) logs a warning, stores `null` and still marks the job done: the task ran. A throw retries the job after `60 s * 2^(attempts - 1)` until `max_attempts` (default 3), then marks it `failed`. A failed job stays until someone retries or cancels it. Run now on a failed job queues it again (like Retry, attempts reset) and runs it in one step.

## Do not run from a hook

`cms.jobs.run()` is on the server instance only. The `cms` that hooks get has `jobs.queue()` and no `run()`. A task opens its own transactions, and a hook holds one open: on a single-connection database (`:memory:` libsql, PGlite, a Durable Object) that deadlocks.

## Tasks and cron entries

`config/resolve-jobs.ts` merges the tasks at startup: built-in tasks (`tenon:`), then plugins in their order, then the host. It throws for a duplicate name, the reserved `tenon:` prefix, a plugin task without its `<plugin>:` prefix, a cron entry for an unknown task, a plugin that schedules another source's task, an invalid cron pattern (checked with croner) and an unknown role in a task's `access`. The built-in tasks are `tenon:publish` and `tenon:unpublish`, see [schedule](../schedule/README.md), and `tenon:webhook` with at least one webhook, see [webhooks](../webhooks/README.md). `visibleTasks()` ties only the schedule tasks to scheduling rights; `tenon:webhook` follows the default rule (admins).

`scheduledTasks` entries are validated and kept on `core.jobs.scheduled`. A pattern MUST have exactly five fields (minute precision): a six-field pattern or a nickname like `@daily` throws at startup.

## Cron

`operations/seed-cron.operation.ts` runs at the top of every `run()`. It deletes the rows of entries that are gone from the config (`deleteStaleCronJobs()`, queued or finished, never a running one), then inserts the first slot after now of every entry (`new Cron(pattern).nextRun(now)`, server time) with `INSERT … ON CONFLICT (cron, task, run_at) DO NOTHING`.

- Two ticks, or two instances, that seed the same slot create one row, and the claim runs it once.
- Only the next slot is seeded. A slot seeded earlier and missed stays queued and runs once on the first tick after it is due. The slots between are never seeded, so there is no catch-up burst. A slot cannot be seeded again after it ran, because it is no longer after now.
- Cron rows have `max_attempts = 1`.
- `execute-job.ts` calls `deleteOlderCronRuns()` when a cron run finishes (done or failed), so an entry keeps only its last run. `deleteDoneJobs()` skips cron rows, so that run stays past 30 days.
- `operations/list-cron.operation.ts` serves `GET /jobs/cron`: `pattern`, `task`, `next` and `last` for the entries whose task the user MAY access.

## Access

`operations/job-access.ts` decides for every route below, one job at a time.

- A job with a `target` (a scheduled publish or unpublish) follows the `update` rule of that target, with the job's document id. `targetOfKey()` turns the `target` column back into a collection or global. A job whose target left the schema counts as any other job.
- Any other job follows the task's `access` rule (`true`, `false`, roles, a function). The default is admins.

A user sees only the jobs they MAY access. `GET /jobs` takes `target` (`collection:<name>`, `global:<name>`) and `docId` filters (`docId=` for a global), so the admin lists the schedule of one document. `visibleTasks()` gives the `jobs` of `/schema`: custom tasks by their rule, and the `tenon:` tasks for users who MAY update an entry with `schedule`.

## Files

| Path                                 | What it does                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                           | `Job`, `JobsApi`, `QueueOptions`, `RunResult`. No runtime imports.                                                 |
| `config/define-task.ts`              | `defineTask`, `Task`, `TaskContext` and `JobsOptions`.                                                             |
| `config/resolve-jobs.ts`             | Merges and checks tasks and cron entries.                                                                          |
| `api.ts`                             | `cms.jobs` of a scope: `queue()`.                                                                                  |
| `operations/queue.operation.ts`      | Inserts a job, joins the transaction, wakes the clock after the commit.                                            |
| `operations/run-jobs.operation.ts`   | One tick: seed cron, claim and run, retention, `{ ran, next }`.                                                    |
| `operations/seed-cron.operation.ts`  | Seeds the next slot of every cron entry and deletes the rows of removed entries.                                   |
| `operations/list-cron.operation.ts`  | `GET /jobs/cron`.                                                                                                  |
| `operations/execute-job.ts`          | Runs a claimed job; done, retry with backoff, or failed.                                                           |
| `operations/job-access.ts`           | Who MAY see a job: the `update` rule of its target, else the task's `access` rule. `visibleTasks()` for `/schema`. |
| `operations/list-jobs.operation.ts`  | `GET /jobs`.                                                                                                       |
| `operations/cancel-job.operation.ts` | Deletes a job. A running job answers 409.                                                                          |
| `operations/retry-job.operation.ts`  | Retries a failed job, and runs a queued or failed job now.                                                         |
| `endpoints/jobs.endpoint.ts`         | `GET /jobs`, `GET /jobs/cron`, `POST /jobs/:id/retry`, `POST /jobs/:id/run`, `DELETE /jobs/:id`. Behind `session`. |
| `endpoints/run.endpoint.ts`          | `GET`/`POST /jobs/run` behind a bearer secret. Open, mounted only with `jobs.secret`.                              |

Rows live in `cms_jobs` (see [db](../db/README.md)). Job SQL stays in `db/queries/jobs/`, so another store can replace it later.
