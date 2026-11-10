# webhooks

Outgoing webhooks. A change of published content queues one `tenon:webhook` job per matching webhook, and the [jobs](../jobs/README.md) clock POSTs it. The host guide is [docs/guide/webhooks.md](../../../../docs/guide/webhooks.md).

## Follow a change

`cms.update("posts", id, data)` reaches `afterChange` in `content/writes/persist-document.ts`, then:

`content/lifecycle/collect-hooks.ts` `slot()` → `emit-webhooks.ts` `webhookHooks()` → `jobs/operations/queue.operation.ts`

- `slot()` appends the webhook hook after the root hooks of `afterChange` and `afterDelete`, so it sees the final document. Every path that runs those stages sends: create, update, publish, `setGlobal`, unpublish (`unpublish-document.ts`), locale removal (`remove-locale.ts`), delete (`remove-document.ts`) and `onDelete` effects. Draft saves return before `afterChange` and send nothing. Media has no hooks.
- The event is `delete` for `afterDelete`, `create` for operation `create`, else `update`.
- `describeChange()` builds the body once per change: `permalink` from the document after, `previousPermalink` from the one before, both through `permalinkUrl()` with the hook's `cms`, so a relation hop reads inside the transaction.
- The job payload is `{ webhook, changes: [change], truncated }`. The URL, secrets and headers stay in the config. A change is minimal, or full (with `doc` and `previousDoc`) for `"full"` and for a `payload` function, which needs the documents when the job sends.
- `queueJob()` joins the write's transaction. A rollback drops the job.
- With `debounce`, the hook queues with `key: <webhook name>`, `runAt: now + debounce` and `merge: mergeBatches`. A change joins the job that waits and never moves its `runAt`: a fixed window. `mergeBatches()` caps a batch at `MAX_CHANGES` (1000) and sets `truncated`.

## Send

`tasks.ts` builds `tenon:webhook` from the resolved config. `create-cms.ts` registers it only with at least one webhook, so `/schema` lists no unused task. The task looks up the webhook by name (gone: result `"removed"`), builds the body (the batch, or what the `payload` function returns for it), signs with `sign.ts`, and POSTs with `redirect: "manual"` and a 10 s timeout. A non-2xx answer or a throw fails the attempt; `maxAttempts` is 5. The error holds the status and 200 characters of the answer. A network error's message has the URL replaced, since the admin shows job errors.

The job has no `target`, so `jobs/operations/job-access.ts` applies the task's default rule: admins.

## Sign

`sign.ts` follows Standard Webhooks: `webhook-id` (the job id, the same on every retry), `webhook-timestamp` (seconds) and `webhook-signature` (`v1,<base64>` per secret, joined with spaces). A `whsec_` secret is base64-decoded; any other string is used as UTF-8. Web Crypto only, so it runs in workerd. `verifyWebhook()` checks the timestamp window and uses `crypto.subtle.verify`, which compares in constant time.

## Files

| Path                         | What it does                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `types.ts`                   | `Webhook`, `WebhooksOptions`, `WebhookBody`, `WebhookChange`. No runtime code.   |
| `config/resolve-webhooks.ts` | Startup checks: http(s) URL, known collections, globals and events, secret size. |
| `emit-webhooks.ts`           | `webhookHooks()`: the hook that matches a change and queues the jobs.            |
| `tasks.ts`                   | The `tenon:webhook` task.                                                        |
| `sign.ts`                    | `signatureHeaders()`, `verifyWebhook()`, `secretKey()`.                          |
