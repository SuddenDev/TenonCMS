---
title: Operations
description: Run work in the background, tell other services about changes, and keep your data safe.
navigation:
  title: Overview
---

Tenon runs inside your app, so it has no separate service to operate. The pages in operations cover what a running site needs beyond its content: work that runs outside a request, messages to people and other services, backups, and changes to the schema and to Tenon itself.

## What to use

| To                                                  | Use                            | See                                                                              |
| --------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Change or check data before it is stored            | A `beforeChange` hook          | [Hooks](/docs/core/working-with-content/hooks)                                   |
| Do slow work after a write, or on a schedule        | A job                          | [Jobs](/docs/core/operations/jobs)                                               |
| Tell another service that published content changed | A webhook                      | [Webhooks](/docs/core/operations/webhooks)                                       |
| Send invites, password resets and your own mail     | `email`                        | [Email](/docs/core/operations/email)                                             |
| Fill a new database, or run code on start           | `seed`, `onInit`               | [Lifecycle hooks](/docs/core/operations/lifecycle-hooks)                         |
| Report errors to a service like Sentry              | `afterError`                   | [Lifecycle hooks](/docs/core/operations/lifecycle-hooks#aftererror)              |
| Save all content, or move it to another database    | `tenon backup`, `cms.export()` | [Backup and restore](/docs/core/operations/backup-and-restore)                   |
| Rename a field, or install a new version of Tenon   | A deploy                       | [Upgrades and schema changes](/docs/core/operations/upgrades-and-schema-changes) |

## React to a change

Hooks, jobs, webhooks and email can all run after a write. They differ in when they run and what happens when they fail:

|                         | Hook                     | Job                         | Webhook                     | Email                     |
| ----------------------- | ------------------------ | --------------------------- | --------------------------- | ------------------------- |
| Runs                    | During the write         | After the commit, on a tick | After the commit, on a tick | At once, when you call it |
| A failure               | Rolls the write back     | Retries                     | Retries                     | Throws to the caller      |
| A rollback of the write | Undoes the hook's writes | Removes the job             | Sends nothing               | Cannot take the mail back |
| Needs the clock         | No                       | Yes                         | Yes                         | No                        |

As a rule:

- Keep hooks fast. They hold the write's transaction open.
- Move calls to other services into a job or a webhook. They run after the commit and retry.
- Send mail that MUST wait for the commit from a job.

## The clock

Jobs, webhooks and scheduled publishing run only when the clock ticks. With Astro on Node, Nuxt, TanStack Start, `tenonAdmin()` and Cloudflare, the adapters tick every minute or when a job is due. On Vercel and other serverless hosts, set up [the clock route](/docs/core/operations/jobs/clock#the-clock-route), or nothing runs.

## Related resources

- [The clock](/docs/core/operations/jobs/clock): the clock on each host.
- [Hooks](/docs/core/working-with-content/hooks): the order of every step in a write.
- [CLI](/docs/cli/overview): backups, restores, users and upgrades from the command line.
