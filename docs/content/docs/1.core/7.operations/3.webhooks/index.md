---
title: Webhooks
description: Tell other services when published content changes.
navigation:
  title: Overview
---

A webhook tells another service that published content changed. After a create, an update or a delete, Tenon sends a `POST` request with JSON to a URL. Use it to rebuild a prerendered site, clear a CDN cache, or pass the change to a tool like n8n or Slack.

::note
The `webhooks` option is for requests that Tenon **sends**. For the other direction, like a shop system that sends a new price to Tenon, see [Receive webhooks](/docs/core/operations/webhooks/receive-webhooks).
::

Webhooks live in `tenon.config.ts`, next to your schema and the keys are the names of the webhooks:

```ts [tenon.config.ts]
export default defineCms({
  // ...
  webhooks: {
    rebuild: { url: process.env.DEPLOY_HOOK_URL!, debounce: 60 },
    purge: {
      url: "https://example.com/api/purge",
      collections: ["pages", "posts"],
      events: ["update", "delete"],
      secret: process.env.WEBHOOK_SECRET,
    },
  },
});
```

Each delivery is a [job](/docs/core/operations/jobs) of the built-in task `tenon:webhook`. It retries on failure, and the admin lists it under **Manage → Jobs**.

## Use webhooks

| To                                                  | See                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Pick the URL, the events and the body of a webhook  | [Send webhooks](/docs/core/operations/webhooks/send-webhooks)               |
| Check that a request comes from Tenon               | [Sign requests](/docs/core/operations/webhooks/send-webhooks#sign-requests) |
| Let another service change content in Tenon         | [Receive webhooks](/docs/core/operations/webhooks/receive-webhooks)         |
| Rebuild a prerendered site when an editor publishes | [Rebuild on publish](/docs/core/operations/webhooks/rebuild-on-publish)     |

## Events

Webhooks follow published content. Drafts and media send nothing.

| Event    | Sent when                                                                                  |
| -------- | ------------------------------------------------------------------------------------------ |
| `create` | A document is created and published                                                        |
| `update` | A document is updated, published or unpublished, a global is saved, or a locale is removed |
| `delete` | A document is deleted, also by an `onDelete: "cascade"` relation                           |

- An unpublish is an `update` with `published: false`.
- An `onDelete: "set-null"` relation sends an `update` for each document it changes.
- The webhook joins the write's transaction. A write that rolls back sends nothing.

## Delivery

- The [clock](/docs/core/operations/jobs/clock) sends each delivery. On Node and Nuxt that is within a minute, in a Durable Object at once. On a serverless host without a clock, nothing is sent until something calls the clock route.
- A `2xx` answer is a success. Any other answer, a redirect, a network error or a timeout of 10 seconds fails the attempt.
- A failed delivery retries after 1, 2, 4 and 8 minutes, five attempts in all. Then the job is `failed`, and **Manage → Jobs** shows the status code and the start of the answer.
- A delivery can arrive twice. The `webhook-id` header stays the same across retries, so the receiver can drop a repeat.
- When you remove a webhook from the config, its waiting deliveries end without a request.

## Code instead of a request

For work that is not an HTTP request, like a cache purge through the API of your platform, use an `afterChange` or `afterDelete` [hook](/docs/core/working-with-content/hooks) on `defineCms()`, and queue a [job](/docs/core/operations/jobs/queue-jobs#queue-from-a-hook) from it. Webhooks run after those hooks.

```ts [tenon.config.ts]
import { defineCms, defineTask } from "tenoncms";

export default defineCms({
  // ...
  hooks: {
    afterChange: [
      async ({ cms, collection, global, doc }) => {
        await cms.jobs.queue("purge-cache", { tag: global ?? `${collection}:${doc.id}` });
      },
    ],
    afterDelete: [
      async ({ cms, collection, id }) => {
        await cms.jobs.queue("purge-cache", { tag: `${collection}:${id}` });
      },
    ],
  },
  jobs: {
    tasks: {
      "purge-cache": defineTask({
        run: async ({ payload }) => {
          const { tag } = payload as { tag: string };
          const response = await fetch("https://api.cdn.example.com/purge", {
            method: "POST",
            headers: { authorization: `Bearer ${process.env.CDN_API_TOKEN}` },
            body: JSON.stringify({ tags: [tag] }),
          });
          if (!response.ok) throw new Error(`Purge failed: ${response.status}`);
        },
      }),
    },
  },
});
```

- `afterChange` does not run on a draft save, so only published changes purge.
- The job joins the write's transaction. It runs after the commit, and a failed purge retries.
- The hooks have a block body on purpose. A hook that returns a value replaces `doc`, and `queue()` returns the id of the job.

## Related resources

- [Jobs](/docs/core/operations/jobs): the clock and the retries behind every delivery.
- [Pages and SEO](/docs/core/building-your-site/pages-and-seo#permalinks): the permalinks in the payload.
- [Headless](/docs/core/working-with-content/headless): read content from another site.
