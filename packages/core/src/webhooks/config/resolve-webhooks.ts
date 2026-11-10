import type { Schema } from "../../schema/index.ts";
import { secretKey } from "../sign.ts";
import type { Webhook, WebhookEvent, WebhooksOptions } from "../types.ts";

/** A webhook with its secrets as a list. */
export type ResolvedWebhook = Omit<Webhook, "secret"> & { secrets: readonly string[] };
export type ResolvedWebhooks = Record<string, ResolvedWebhook>;

const EVENTS: readonly WebhookEvent[] = ["create", "update", "delete"];
/** The minimum key length of Standard Webhooks. */
const MIN_KEY_BYTES = 24;

/**
 * Checks the `webhooks` option against the schema.
 * @throws If a URL is not http(s) (a missing env var included), a collection, global or event is unknown, `debounce` is
 * not a positive number, or a secret is shorter than 24 bytes or not valid base64 after `whsec_`.
 */
export function resolveWebhooks(
  webhooks: WebhooksOptions = {},
  schema: Required<Schema>,
): ResolvedWebhooks {
  const resolved: ResolvedWebhooks = {};
  for (const [name, { secret, ...hook }] of Object.entries(webhooks)) {
    const fail = (message: string): never => {
      throw new Error(`tenoncms: webhook "${name}" ${message}`);
    };

    if (!/^https?:$/.test(URL.parse(String(hook.url))?.protocol ?? ""))
      fail("MUST have an http(s) `url`");
    for (const c of hook.collections ?? [])
      if (!schema.collections[c]) fail(`names unknown collection "${c}"`);
    for (const g of hook.globals ?? []) if (!schema.globals[g]) fail(`names unknown global "${g}"`);
    for (const e of hook.events ?? [])
      if (!EVENTS.includes(e)) fail(`names unknown event "${e}", use ${EVENTS.join(", ")}`);
    if (hook.debounce !== undefined && !(hook.debounce > 0 && Number.isFinite(hook.debounce)))
      fail("`debounce` MUST be a positive number of seconds");

    const secrets = secret === undefined ? [] : typeof secret === "string" ? [secret] : secret;
    for (const s of secrets) {
      let bytes = 0;
      try {
        bytes = secretKey(s).length;
      } catch {}
      if (bytes < MIN_KEY_BYTES)
        fail(`\`secret\` MUST be at least ${MIN_KEY_BYTES} bytes, or whsec_ with valid base64`);
    }

    resolved[name] = { ...hook, secrets };
  }
  return resolved;
}
