# Jobs

Jobs are background work that runs outside a request: send a digest, rebuild a cache, call a webhook. You write a **task**, **queue** jobs for it from a hook or server code, and a **clock** runs the due jobs. The queue is a table in your database, so it works with every database tenoncms supports and needs no extra service.

## Define tasks

```ts
// tenon.config.ts
import { defineCms, defineTask } from "tenoncms";

export default defineCms({
  jobs: {
    tasks: {
      "send-digest": defineTask({
        meta: { description: "Emails the weekly digest" },
        run: async ({ payload, cms }) => {
          const posts = await cms.find("posts", { limit: 5 });
          // ... send ...
          return { sent: posts.length };
        },
      }),
    },
  },
});
```

- `run` gets the job's `payload`, the server `cms` (no user, no access rules, published reads) and `job: { id, attempts }`.
- A returned value is stored as the job's `result`. It SHOULD be JSON. A value that cannot be turned into JSON (a `BigInt`, a circular object) logs a warning, stores no result and still counts as done. It does not fail the job.
- A throw fails the attempt. The job runs again after a backoff of 60 s, 2 min, 4 min and so on, until `maxAttempts` (default 3). Then it is `failed`.
- Task names MUST NOT start with `tenon:`. Plugins prefix theirs with their name, see [Plugins](./plugins.md).

## Queue jobs

```ts
await cms.jobs.queue("send-digest", { list: "weekly" });
await cms.jobs.queue("send-digest", { list: "daily" }, { runAt: new Date(Date.now() + 3_600_000) });
await cms.jobs.queue("send-digest", null, { maxAttempts: 1 });
```

Inside a hook, use the `cms` the hook gets. The job joins the write's transaction, so a rollback removes it and the job can only run after the write is committed:

```ts
hooks: {
  afterChange: [({ cms, doc }) => cms.jobs.queue("send-digest", { id: doc.id })],
}
```

Queuing a task that is not defined throws.

### One job per key

`key` keeps at most one queued job per task and key. While one waits, queueing again returns its id and changes nothing. Once it runs, the key is free. Together with a later `runAt`, this collects calls into one run:

```ts
// One rebuild per minute at most, however many writes happen.
afterChange: [({ cms }) => cms.jobs.queue("rebuild", null, { key: "site", runAt: Date.now() + 60_000 })],
```

`merge(queued, next)` returns the new payload of the job that waits, for a task that needs every call's data:

```ts
cms.jobs.queue("reindex", [doc.id], {
  key: "search",
  runAt: Date.now() + 30_000,
  merge: (queued, next) => [...(queued as string[]), ...(next as string[])],
});
```

- A key saves work, it is no guarantee. Two writes that queue the first job at the same moment in separate Postgres transactions MAY create two jobs.
- A job that fails and retries waits under its key again, so new calls join the retry.

## Run the due jobs

Nothing runs a job until the clock ticks. A tick runs the jobs that are due, one after another, up to 100:

```ts
const { ran, next } = await cms.jobs.run(); // next: epoch ms of the next due job, or null
```

- Any number of callers MAY tick at once. Each job runs for one of them.
- `run()` is on the server instance only. Hooks get `cms.jobs.queue()` and no `run()`: a hook holds a transaction open, and running tasks inside it blocks a single-connection database.
- Delivery is **at least once**. A running job holds a lease for five minutes. If its host dies, or the task runs longer, another tick runs it again. Write tasks so that a repeat is harmless.
- Done jobs are deleted after 30 days. Failed jobs stay until someone retries or cancels them.

### The clock

Nothing runs a job until something ticks. The adapters bring a clock, so on most hosts a job runs within a minute of its time without any setup.

| Host                                        | Clock                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Nuxt                                        | A Nitro scheduled task (`tenon:jobs`), every minute                                             |
| TanStack Start, standalone (`tenonAdmin()`) | The same Nitro task                                                                             |
| Astro on Node (and `astro dev`)             | An interval in the server process, every minute, started by the first request                   |
| Cloudflare (Durable Object)                 | The object's alarm. It wakes when a job is due, and the first request after a restart starts it |
| Astro on Vercel, any other serverless host  | None. Use [the clock route](#the-clock-route)                                                   |

- The Nitro task needs a host that runs scheduled tasks: Node, Bun, Deno, Cloudflare Cron Triggers and Vercel Cron Jobs. Nitro sets up the platform's cron for you, and every host has its own limits on how often it may run.
- **Vercel Hobby** allows a cron job once a day, and a deploy with an every-minute cron fails. On Hobby, set `jobs: false` and ping [the clock route](#the-clock-route) from an outside service, or use the Pro plan.
- The Astro interval stops with the process. A job that is due while the server is down runs on the first tick after the start.
- Turn the built-in clock off with `jobs: false` on the Astro integration, the Nuxt module (`tenonCms: { jobs: false }`) or `tenonAdmin({ jobs: false })`. Then call `cms.jobs.run()` yourself or use the clock route.

### The clock route

An external clock can call `/_tenon/jobs/run`. Set a secret and the route appears:

```ts
defineCms({ jobs: { secret: process.env.CRON_SECRET, tasks: {/* ... */} } });
```

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://example.com/_tenon/jobs/run
# {"ran":2,"next":1767000000000}
```

- `GET` and `POST` both work, so Vercel Cron (which sends `GET` with `Authorization: Bearer $CRON_SECRET`) works as is. Add the path to `vercel.json` under `crons`.
- Any cron or uptime service that can send a header works as a pinger, e.g. every minute from a free cron service when the host has no clock of its own.
- A missing or wrong token answers 401. Without `secret` the route does not exist.
- Responses are never cached.

## Cron entries

`scheduledTasks` maps cron patterns to task names. Patterns are checked at startup, with the names:

```ts
jobs: {
  tasks: { "send-digest": digest },
  scheduledTasks: { "0 3 * * *": ["send-digest"] },
}
```

- A pattern MUST have exactly five fields: minute, hour, day of month, month, day of week. Six fields (seconds) and nicknames like `@daily` throw when `defineCms()` runs, like an unknown task or an invalid pattern.
- Times are **server time**: the time zone of the process that runs the tick. Set `TZ` on the host if that is not the zone you mean.
- Each tick (`cms.jobs.run()`) first queues the next slot of every entry. A slot is queued once, however many instances tick, and runs once.
- A cron job gets one attempt. A failure is not retried, because the next slot is the retry.
- **Missed slots run once.** If the server was down or no tick came, the slot that was queued before runs on the next tick. The slots between are skipped. There is no catch-up burst.
- The first slot is the first one after the first tick. A new entry does not run for a time in the past.
- Only the last run of an entry is kept, done or failed. A new run replaces it. Cron runs are not deleted after 30 days.
- When you remove an entry from the config, its queued and finished runs are deleted on the next tick.
- Cron jobs run as the server (no user), like queued jobs.

A cron job needs a clock that ticks at least as often as the pattern fires. See [the clock](#the-clock).

## Built-in tasks

Core registers two tasks for [scheduled publishing](./drafts.md#scheduling), and `tenon:webhook` when you define [webhooks](./webhooks.md). Their names start with `tenon:`, which no task of yours MAY use.

| Task              | What it does                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `tenon:publish`   | Publishes the draft of a document or global as it is when the job runs. Result: `"published"` |
| `tenon:unpublish` | Takes a document or global off the published perspective. Result: `"unpublished"`             |
| `tenon:webhook`   | Sends one [webhook](./webhooks.md) delivery. Result: `{ status }`, or `"removed"`             |

Both give the result `"missing"` for a document that is gone, and the job is done. You queue them with `cms.schedule()` and `cms.scheduleGlobal()`, not with `jobs.queue()`.

## Access

`access` on a task decides who sees and manages its jobs through `/_tenon/jobs`. It takes `true`, `false`, a list of roles or a function, like the rules in [Auth, users and access](./auth-and-access.md#access-control). The default is admins only. A user sees only the jobs of tasks they MAY access. Server code and the clock skip the rule.

A job of a document or global (a scheduled publish or unpublish) follows the `update` rule of that entry instead, for that document. Editors who MAY update it see and cancel the job, whatever the task's rule. The `tenon:` tasks have no rule of their own.

```ts
defineTask({ access: ["editor"], run: async () => {} });
```

## The Jobs page

The admin has a **Jobs** page under Manage. It shows when you MAY see at least one task, so an editor who MAY update an entry with [`schedule`](./drafts.md#scheduling) sees it, too. Without such a task the entry is hidden.

- Tabs: **Upcoming** (queued), **Running**, **Failed**, **Done** and **Cron**. A task filter narrows the list to one task. The page refreshes every ten seconds.
- A row shows the task, its target (a link to the document or global, for a scheduled publish or unpublish), the time it is due, its status, attempts, who created it and the last error. Attempts show the limit (`1 / 3`) until the job is done, then only the count. **Details** in a row opens a sheet with everything the job holds: schedule, target, payload, result and error. It works for jobs that have not run yet.
- **Run now** runs a queued or failed job at once. **Retry** puts a failed job back in the queue. **Cancel** deletes a queued or failed job after asking. A running or done job has no action.
- A row that cron created has no Cancel, because the next tick queues its slot again.
- **Cron** lists the entries with the next and the last run. Patterns use server time; the page shows each time in your time zone.

## The jobs API

All routes need a session, and `Cache-Control: no-store`. An API key cannot reach them. There is no route that queues a job: only server code queues, with `cms.jobs.queue()` or a schedule.

| Route                  | What it does                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /jobs`            | The jobs you MAY see (`docId` filters by document id, `id` by job id). Filter with `?status=queued\|running\|done\|failed`, `task`, `target`, `docId`, `id`, `limit` |
| `GET /jobs/cron`       | The cron entries you MAY see: `pattern`, `task`, `next` (ISO string, server time) and `last` (the last run, or null)                                                 |
| `POST /jobs/:id/retry` | Puts a failed job back in the queue with all its attempts. The next tick runs it                                                                                     |
| `POST /jobs/:id/run`   | Run now. Runs a queued job, or a failed one after queuing it again, and answers with the job after the run. A running or done job answers 409                        |
| `DELETE /jobs/:id`     | Cancels a job. A running job answers 409                                                                                                                             |

A job has `id`, `task`, `payload`, `status`, `runAt`, `attempts`, `maxAttempts`, `result`, `error`, `user` (who queued it) and `createdAt`.

The client has the same calls, with the same rules: `client.jobs.list(filter)`, `cron()`, `run(id)`, `retry(id)` and `cancel(id)`. The clock route `/jobs/run` is not on the client.
