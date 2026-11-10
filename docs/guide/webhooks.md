# Webhooks

A webhook tells another service that published content changed. Tenon POSTs JSON to a URL after a create, an update or a delete: a deploy hook rebuilds a prerendered site, a purge endpoint clears cached URLs, n8n or Slack picks up the change. Tenon has no read cache of its own, so this is how a host's build or CDN learns about new content.

Webhooks live in the config, next to the schema, and secrets come from env vars. Deliveries are [jobs](./jobs.md): they retry, and you see them on the Jobs page.

## Define webhooks

```ts
// tenon.config.ts
export default defineCms({
  webhooks: {
    rebuild: { url: process.env.DEPLOY_HOOK_URL!, debounce: 60 },
    purge: {
      url: "https://example.com/api/purge",
      collections: ["pages", "posts"],
      events: ["update", "delete"],
      secret: process.env.WEBHOOK_SECRET,
      headers: { authorization: `Bearer ${process.env.PURGE_TOKEN}` },
    },
  },
});
```

| Option        | What it does                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `url`         | Where to POST. MUST be http(s). A missing env var fails at startup.                            |
| `collections` | Collections that send. Without `collections` and `globals`, every collection and global sends. |
| `globals`     | Globals that send. Once `collections` or `globals` is set, only the listed entries send.       |
| `events`      | `create`, `update`, `delete`. Default: all.                                                    |
| `payload`     | `"minimal"` (default), `"full"` or a function. See [Payload](#payload).                        |
| `debounce`    | Seconds to collect changes into one request. See [Debounce](#debounce).                        |
| `secret`      | Signs each request. See [Verify a request](#verify-a-request).                                 |
| `headers`     | Extra request headers, such as `authorization`.                                                |

The jobs store only the webhook's name and the body. The URL, the secret and the headers stay in the config, so a deploy hook URL with a token never reaches the database.

## Events

Webhooks follow published content:

- `create`: a document is created and published.
- `update`: a document is updated or published, a global is saved, a locale is removed. **An unpublish is an `update` with `published: false`.**
- `delete`: a document is deleted, by you or by an `onDelete` cascade. A `set-null` effect sends an `update` for the document it changes.
- Draft saves send nothing. Media uploads send nothing.

The delivery joins the write's transaction: a write that rolls back sends nothing.

## Payload

Every request has the same shape: a list of changes. Without `debounce` the list holds one change.

```json
{
  "changes": [
    {
      "event": "update",
      "collection": "posts",
      "id": "8f2c…",
      "locale": "en",
      "published": true,
      "permalink": "/en/posts/new-slug",
      "previousPermalink": "/en/posts/old-slug",
      "at": "2026-11-10T12:00:00.000Z"
    }
  ],
  "truncated": false
}
```

- A global has `global` instead of `collection` and `id`.
- `permalink` is the public URL after the change, `previousPermalink` the one before. Both are `null` without a [`permalink`](./live-preview.md). A purge needs both, because a slug change moves the URL. On delete, `permalink` is `null`.
- `locale` is `null` without [localization](./localization.md).

`payload: "full"` adds `doc` and `previousDoc` to each change: the stored documents, with relations as ids. A function gets the batch with the full changes and returns the body, for a service that expects its own format:

```ts
slack: {
  url: process.env.SLACK_WEBHOOK_URL!,
  collections: ["posts"],
  events: ["create"],
  payload: ({ changes }) => ({
    text: changes.map((c) => `New post: ${c.doc?.title} ${c.permalink}`).join("\n"),
  }),
},
```

The function runs when the job sends, outside the write. It MAY be async. A throw fails the attempt, like a failed request.

## Debounce

A bulk import or a cascade delete changes many documents at once. A deploy hook should run once, not 500 times. With `debounce: 60`, the first change opens a 60-second window, and every change in the window joins the same request.

- The window is fixed. Later changes do not move it, so constant editing never holds a deploy back for more than `debounce`, plus one clock tick.
- A request carries at most 1000 changes. Past that, the rest are dropped and `truncated` is `true`: treat everything as changed (rebuild, or purge all).
- A change that arrives while the request is running opens a new window.
- With `debounce`, a change waits in the database, so `"full"` and function webhooks store the documents in the job until it sends.

## Delivery

- A delivery is a `tenon:webhook` job. The [clock](./jobs.md#the-clock) sends it: within a minute on Node and Nuxt, right away in a Durable Object, and only when the clock route is called on serverless hosts.
- A 2xx answer is done. Any other answer, a redirect, a network error or a timeout (10 s) fails the attempt. It retries after 1, 2, 4 and 8 minutes, five attempts in all, then the job is `failed`.
- The job's error shows the status and the first 200 characters of the answer, never the URL.
- Delivery is at least once. The `webhook-id` header stays the same across retries, so a receiver MAY drop a repeat.
- A job of a webhook you removed from the config ends as `"removed"` without a request.
- Without `debounce`, every change sends its own request per webhook. A bulk import of 500 documents sends 500 requests.

## Verify a request

With a `secret`, each request carries [Standard Webhooks](https://www.standardwebhooks.com/) headers:

| Header              | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| `webhook-id`        | The job id                                                |
| `webhook-timestamp` | Send time, Unix seconds                                   |
| `webhook-signature` | `v1,<base64 HMAC-SHA256 of "${id}.${timestamp}.${body}">` |

- A secret is `whsec_` plus base64 (the Standard Webhooks format), or a plain string. Either way the key MUST be at least 24 bytes: `openssl rand -base64 32`.
- A list (`secret: [next, current]`) signs with each and sends the signatures separated by spaces. Add the new secret on both sides, then drop the old one.
- Without a secret the request is not signed. A deploy hook URL is its own secret.

A receiver on tenoncms checks a request with `verifyWebhook()`. It reads a clone, so the body stays readable:

```ts
import { verifyWebhook } from "tenoncms";

export async function POST(request: Request) {
  if (!(await verifyWebhook(request, process.env.WEBHOOK_SECRET!)))
    return new Response(null, { status: 401 });
  const { changes, truncated } = await request.json();
  // purge `permalink` and `previousPermalink` of each change, or everything when `truncated`
  return new Response(null, { status: 204 });
}
```

It rejects a timestamp more than 5 minutes off (`{ tolerance: 300 }`, in seconds). Receivers on other stacks use a [Standard Webhooks library](https://github.com/standard-webhooks/standard-webhooks).

## A deploy button

Some teams publish several changes, then deploy once. An [action](./admin.md#actions) adds a one-click Deploy button to the admin's top bar. The hook URL stays on the server. `examples/vercel` has the full version (`src/deploy/plugin.ts`), with a second button in the Manage section.

```ts
admin: {
  actions: {
    deploy: {
      label: "Deploy",
      nav: { icon: "rocket" },
      confirm: "Rebuild and publish the live site?",
      run: async () => {
        const response = await fetch(process.env.DEPLOY_HOOK_URL!, { method: "POST" });
        if (!response.ok) throw new Error(`The deploy hook answered ${response.status}`);
        return "Deploy started";
      },
    },
  },
}
```

- Actions are for admins unless `access` says otherwise.
- `run` calls the hook directly. A job would wait for the clock, and a serverless host such as Vercel has none unless you add one.
- Prerendered pages show the last deploy. Give the collection a `preview` URL that renders per request (`preview: "/preview/posts/{slug}"`), so the admin's preview shows drafts. See [Live preview](./live-preview.md).
- For deploys without a button, add a `rebuild` webhook with `debounce` and a [clock](./jobs.md#the-clock).

## Code instead of HTTP

For work that is not an HTTP call, such as a cache purge through a platform API, use a root `afterChange` or `afterDelete` [hook](./hooks.md#root-hooks) and queue a [job](./jobs.md). Webhooks run after the root hooks.
