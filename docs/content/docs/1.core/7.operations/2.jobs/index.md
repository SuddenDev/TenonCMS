---
title: Jobs
description: Run slow or scheduled work in the background, with retries.
navigation:
  title: Overview
---

A job is work that runs outside a request, such as sending a digest, rebuilding a cache or calling another service. You write a **task**, **queue** jobs for it from a hook or your server code, and a **clock** runs the jobs when they are due. This page explains how jobs work and how to define a task.

The queue is a table in your database. It needs no extra service and works on every database Tenon supports.

```ts [tenon.config.ts]
import { defineCms, defineTask } from "tenoncms";

export default defineCms({
  // ...
  jobs: {
    tasks: {
      "send-digest": defineTask({
        meta: { description: "Emails the weekly digest" },
        run: async ({ payload, cms }) => {
          const posts = await cms.find("posts", { limit: 5 });
          // ... send the email
          return { sent: posts.length };
        },
      }),
    },
  },
});
```

[Scheduled publishing](/docs/core/working-with-content/scheduled-publishing) and [webhooks](/docs/core/operations/webhooks) are jobs too. Everything in this section applies to them.

## Use jobs

| To                                          | See                                                         |
| ------------------------------------------- | ----------------------------------------------------------- |
| Queue a job from a hook or your server code | [Queue jobs](/docs/core/operations/jobs/queue-jobs)         |
| Run a task every night or every hour        | [Recurring jobs](/docs/core/operations/jobs/recurring-jobs) |
| Make due jobs run on your host              | [The clock](/docs/core/operations/jobs/clock)               |
| Watch, retry and cancel jobs in the admin   | [Manage jobs](/docs/core/operations/jobs/manage-jobs)       |

## Define a task

A task is a `run` function under a name in `jobs.tasks`. `run` gets:

- `payload`: the JSON the job was queued with.
- `cms`: the server API. It has no user, skips the access rules and reads published content. `cms.withDrafts()` reads drafts.
- `job`: the `id` of the job and its `attempts`, counting this run.

What `run` returns is stored as the job's result. It SHOULD be JSON. A value that is not JSON, like a `BigInt`, logs a warning and the job still counts as done.

Task names MUST NOT start with `tenon:`. Tenon uses that prefix for its own tasks. A [plugin](/docs/core/customization/plugins) prefixes its tasks with its name.

## Failures and retries

A task that throws fails the attempt. The job runs again after 1 minute, then 2, then 4, and so on, until it reaches `maxAttempts`. Then its status is `failed`, and it stays until someone [retries or cancels](/docs/core/operations/jobs/manage-jobs) it.

::note
A job can run more than once. A running job holds a lease of five minutes. If its host dies, or the task takes longer, the next tick runs it again. Write each task so that running it twice does no harm, for example by checking first whether the work is done.
::

- Done jobs are deleted after 30 days.
- A failed attempt also runs the [lifecycle `afterError`](/docs/core/operations/lifecycle-hooks#aftererror) hook, so your error reporting sees it.

## Related resources

- [Scheduled publishing](/docs/core/working-with-content/scheduled-publishing): the built-in publish and unpublish jobs.
- [Webhooks](/docs/core/operations/webhooks): deliveries that run as jobs.
- [Hooks](/docs/core/working-with-content/hooks): where most jobs are queued.
