# schedule

Scheduled publish and unpublish. A collection or global with `schedule: true` accepts `cms.schedule()` and `cms.scheduleGlobal()`, which queue a job for the [jobs](../jobs/README.md) module. The module has no timer: the job runs when the host's clock calls `cms.jobs.run()`.

## Follow a schedule

`cms.schedule("posts", id, { action, at, locale })` flows through:

`operations/local/schedule.local.ts` → `operations/schedule.operation.ts` → `jobs/operations/queue.operation.ts`

`scheduleJob()` runs these steps in order:

1. The local method checks that the collection exists and is writable, or that the global exists.
2. The entry MUST have `schedule`, else a `ValidationError`.
3. `withLocale()` applies and validates `locale`.
4. `guard(update)` with the document id. A denied caller gets 401 or 403, before the time is looked at.
5. A collection document MUST exist in the drafts perspective (`loadSource()`, so a draft-only document counts), else the result is `undefined` and the endpoint answers 404. A global always exists.
6. `action` MUST be known and `at` a valid time. A time in the past is due at once, so the next `cms.jobs.run()` fires it.
7. A publish MUST find a draft: `hasDraft`, `publishedAt === null` or, in a localized entry, a `sharedDraft`. A localized entry also needs a row in the locale. Else a `ValidationError` with `""`: `"Nothing to publish"`. An unpublish has no such check.
8. `deleteQueuedTargetJobs()` deletes a queued job of the same task, document and locale. A new schedule replaces the old one, so each document has at most one queued publish and one queued unpublish per locale.
9. `queueJob()` inserts the job with `runAt = at` and the `target`, `doc_id` and `locale` columns. Inside a transaction it joins both steps.

The job payload is a `ScheduledPayload`: `kind`, `name`, `id` and the locale (`null` for an entry that is not `localized`). The `locale` column holds the same value, and `doc_id` is `''` for a global.

## Keep the draft

A queued publish locks its draft, so the job publishes what was scheduled. `operations/require-unscheduled.ts` throws a `ValidationError` (`"A publish is scheduled. Cancel it first."`) when the draft would change:

- a draft save of the locale (`writeDocument()` in `draft` mode, not a create). `copyLocale()` into the locale is one, so is a version restore.
- `discard()` of the locale, or of any locale with `all`. It runs after the `update` rule, inside the operation.
- `removeLocale()` of the locale.

A draft save in another locale still writes the shared fields, which the job publishes with its locale. A publish without `draft` and deleting the document do not check: the job then publishes nothing new, or ends as `"missing"`.

## Fire a schedule

`tasks.ts` defines the built-in tasks `tenon:publish` and `tenon:unpublish`, which `create-cms.ts` passes to `resolveJobs()`. A task calls `cms.publish()`, `cms.publishGlobal()`, `cms.unpublish()` or `cms.unpublishGlobal()` of the server `cms`, so the locked draft is published when the job runs. The result is `"published"`, `"unpublished"` or `"missing"` for a document that is gone: the job is then done and not retried. A throw (a publish that fails validation) retries with the usual backoff, then fails.

## Access

- **Scheduling** needs the `update` rule of the entry now. The job runs as the server (`overrideAccess`), so it checks nothing when it fires and `updated_by` is `null`. Running as the scheduling user is a follow-up.
- **Managing jobs**: `jobs/operations/job-access.ts` lets a job with a `target` follow the `update` rule of that target with the job's document id, not the task's rule. A job whose target left the schema falls back to the task's rule (admins). So an editor who MAY update a document sees, cancels and runs its schedule jobs through `GET /jobs?status=queued&target=…&docId=…`.
- **`/schema`**: `access/permissions.ts` adds `jobs: [{ name, description }]`. The `tenon:` tasks are in the list for users who MAY update some entry with `schedule`.

## Files

| Path                                 | What it does                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                           | `ScheduleOptions`, `ScheduleAction`, `ScheduledPayload`. No runtime imports.                                                                         |
| `tasks.ts`                           | The built-in `tenon:publish` and `tenon:unpublish` tasks.                                                                                            |
| `operations/schedule.operation.ts`   | The steps above, for collections and globals.                                                                                                        |
| `operations/require-unscheduled.ts`  | `requireUnscheduled()`: the guard of discard and locale removal.                                                                                     |
| `operations/local/schedule.local.ts` | `cms.schedule()` and `cms.scheduleGlobal()`.                                                                                                         |
| `endpoints/schedule.endpoint.ts`     | `POST /collections/:name/:id/schedule` and `POST /globals/:name/schedule`. Content write routes: CSRF and `optionalSession`, then the `update` rule. |

`schema/validation/check-schema.ts` throws at startup for `schedule` with `drafts: false`. The flag reaches `/schema` as it is.
