import { defineTask } from "../jobs/config/define-task.ts";
import type { ResolvedWebhooks } from "./config/resolve-webhooks.ts";
import { WEBHOOK_TASK, type WebhookJob } from "./emit-webhooks.ts";
import { signatureHeaders } from "./sign.ts";
import type { WebhookChange } from "./types.ts";

const TIMEOUT = 10_000;

/**
 * The built-in `tenon:webhook` task. It POSTs the job's batch, or what the webhook's `payload` function makes of it, to
 * the webhook's current config, so retries pick up a changed URL or secret. A non-2xx answer or a network error throws and retries. A webhook gone from the config ends
 * the job as `"removed"`. Registered only with at least one webhook, so the admin lists no unused task.
 */
export function webhookTasks(webhooks: ResolvedWebhooks) {
  return {
    [WEBHOOK_TASK]: defineTask({
      meta: { description: "Sends a webhook" },
      async run({ payload, job }) {
        const { webhook, changes, truncated } = payload as WebhookJob;
        const hook = webhooks[webhook];
        if (!hook) return "removed";

        const body =
          typeof hook.payload === "function"
            ? await hook.payload({ changes: changes as WebhookChange[], truncated })
            : { changes, truncated };
        const text = JSON.stringify(body);
        const headers = new Headers(hook.headers);
        headers.set("content-type", "application/json");
        for (const [key, value] of Object.entries(
          await signatureHeaders(hook.secrets, job.id, text),
        ))
          headers.set(key, value);

        let response: Response;
        try {
          response = await fetch(hook.url, {
            method: "POST",
            headers,
            body: text,
            redirect: "manual",
            signal: AbortSignal.timeout(TIMEOUT),
          });
        } catch (error) {
          // The job's error is visible in the admin. A deploy hook's URL carries its token.
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Request failed: ${message.replaceAll(hook.url, "<url>")}`);
        }
        if (!response.ok)
          throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        return { status: response.status };
      },
    }),
  };
}
