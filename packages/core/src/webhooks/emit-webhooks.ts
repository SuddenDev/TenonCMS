import type { Core, Stage } from "../cms/runtime/types.ts";
import { type ContentTarget, target } from "../content/targets.ts";
import { permalinkUrl } from "../preview/server/resolve-url.ts";
import type { HookArgs } from "../schema/hooks/index.ts";
import type { ResolvedWebhook } from "./config/resolve-webhooks.ts";
import type { WebhookBatch, WebhookBody, WebhookChange, WebhookEvent } from "./types.ts";

export const WEBHOOK_TASK = "tenon:webhook";
/** The most changes one request carries. */
export const MAX_CHANGES = 1000;

/** The payload of a `tenon:webhook` job. It names the webhook, so the URL, secret and headers stay in the config. */
export type WebhookJob = WebhookBatch<WebhookBody | WebhookChange> & { webhook: string };

type Doc = Record<string, any>;
type ChangeArgs = HookArgs & { operation?: string; doc: Doc; previousDoc?: Doc };

/**
 * The hook of `afterChange` or `afterDelete` that queues one delivery per webhook matching the target and the event.
 * The queue joins the write's transaction, so a rollback sends nothing. With `debounce`, the change joins the job
 * that waits for the webhook.
 * @returns No hook for other stages or when no webhook sends for `name`.
 */
export function webhookHooks(core: Core, name: ContentTarget, stage: Stage) {
  if (stage !== "afterChange" && stage !== "afterDelete") return [];
  const webhooks = Object.entries(core.webhooks).filter(([, hook]) => sendsFor(hook, name));
  if (!webhooks.length) return [];

  return [
    async (args: ChangeArgs) => {
      const event: WebhookEvent =
        stage === "afterDelete" ? "delete" : args.operation === "create" ? "create" : "update";
      const matching = webhooks.filter(([, hook]) => !hook.events || hook.events.includes(event));
      if (!matching.length) return;

      const change = await describeChange(core, name, event, args);
      for (const [webhook, hook] of matching) {
        const job: WebhookJob = { webhook, changes: [changeFor(hook, change)], truncated: false };
        await args.cms.jobs.queue(WEBHOOK_TASK, job, {
          maxAttempts: 5,
          ...(hook.debounce && {
            key: webhook,
            runAt: Date.now() + hook.debounce * 1000,
            merge: mergeBatches,
          }),
        });
      }
    },
  ];
}

/** Appends the changes of `next` to the waiting job, up to {@link MAX_CHANGES}; past that it only marks `truncated`. */
export function mergeBatches(queued: unknown, next: unknown): WebhookJob {
  const job = queued as WebhookJob;
  const changes = [...job.changes, ...(next as WebhookJob).changes];
  if (changes.length <= MAX_CHANGES) return { ...job, changes };
  return { ...job, changes: changes.slice(0, MAX_CHANGES), truncated: true };
}

// Without `collections` and `globals`, every entry sends. Once one is set, only the listed entries do.
function sendsFor(hook: ResolvedWebhook, name: ContentTarget) {
  if (!hook.collections && !hook.globals) return true;
  const names = name.kind === "collection" ? hook.collections : hook.globals;
  return names?.includes(name.name) ?? false;
}

async function describeChange(
  core: Core,
  name: ContentTarget,
  event: WebhookEvent,
  args: ChangeArgs,
): Promise<WebhookChange> {
  const doc = event === "delete" ? null : args.doc;
  const previousDoc = (event === "delete" ? args.doc : args.previousDoc) ?? null;
  const entry = target(core, name);
  const where = { locale: args.locale, localization: core.localization };
  const url = (d: Doc | null) =>
    d && entry.permalink ? permalinkUrl(entry, d, args.cms, where) : null;

  return {
    event,
    ...(name.kind === "global"
      ? { global: name.name }
      : { collection: name.name, id: (doc ?? previousDoc)!.id }),
    locale: args.locale ?? null,
    published: doc?.publishedAt != null,
    permalink: await url(doc),
    previousPermalink: await url(previousDoc),
    at: new Date().toISOString(),
    doc,
    previousDoc,
  };
}

// A payload function gets the documents too, because it builds its body from them when the job sends.
function changeFor(hook: ResolvedWebhook, change: WebhookChange): WebhookBody | WebhookChange {
  if (hook.payload === "full" || typeof hook.payload === "function") return change;
  const { doc, previousDoc, ...body } = change;
  return body;
}
