import { z } from "zod";
import type { EmailAdapter, EmailMessage } from "./types.ts";

type SendEmailAddress = string | { name: string; email: string };

/** The part of a `send_email` binding that {@link cloudflareEmail} uses. */
export type SendEmailBinding = {
  send(message: {
    from: SendEmailAddress;
    to: SendEmailAddress | SendEmailAddress[];
    replyTo?: SendEmailAddress;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
};

/** Options of `cloudflareEmail()` with an API token. */
export type CloudflareEmailApiOptions = {
  /** Cloudflare account ID. */
  accountId: string;
  /** An API token with the permission `Email Sending Write`. */
  apiToken: string;
  /** Custom `fetch`. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

const API = "https://api.cloudflare.com/client/v4/accounts";

const apiAnswer = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number(), message: z.string() })).default([]),
  result: z.object({ permanent_bounces: z.array(z.string()).default([]) }).nullish(),
});

/**
 * Sends through Cloudflare Email Service with a `send_email` binding, e.g. `cloudflareEmail(env.EMAIL)` with `env`
 * from `cloudflare:workers`. The sender's domain MUST be onboarded to Email Service. Workers only.
 * @throws The binding's `Error`, whose `code` names the failure, e.g. `E_SENDER_NOT_VERIFIED`.
 */
export function cloudflareEmail(binding: SendEmailBinding): EmailAdapter;
/**
 * Sends through the REST API of Cloudflare Email Service. Runs on Node and Workers. The sender's domain MUST be
 * onboarded to Email Service.
 * @throws An `Error` whose `code` is Cloudflare's error number, e.g. `10208`. Also when a recipient bounces
 * permanently; the others MAY already have the message, so callers MUST NOT retry blindly.
 */
export function cloudflareEmail(options: CloudflareEmailApiOptions): EmailAdapter;
export function cloudflareEmail(
  source: SendEmailBinding | CloudflareEmailApiOptions,
): EmailAdapter {
  if (!source || !("accountId" in source)) return cloudflareEmailBinding(source);
  return cloudflareEmailApi(source);
}

function cloudflareEmailBinding(binding: SendEmailBinding): EmailAdapter {
  return {
    async send(message) {
      if (!binding) throw new Error("tenoncms: the `send_email` binding is missing");
      await binding.send({
        ...message,
        from: parseAddress(message.from),
        to: mapRecipients(message.to, parseAddress),
        ...(message.replyTo && { replyTo: parseAddress(message.replyTo) }),
      });
    },
  };
}

function cloudflareEmailApi({
  accountId,
  apiToken,
  fetch: fetchFn = (...args) => fetch(...args),
}: CloudflareEmailApiOptions): EmailAdapter {
  return {
    async send({ replyTo, ...message }) {
      if (!accountId) throw new Error("tenoncms: cloudflareEmail() needs `accountId`");
      if (!apiToken) throw new Error("tenoncms: cloudflareEmail() needs `apiToken`");

      const response = await fetchFn(`${API}/${encodeURIComponent(accountId)}/email/sending/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          ...message,
          from: toApiAddress(message.from),
          to: mapRecipients(message.to, toApiAddress),
          // The API documents `reply_to` as a plain address only.
          ...(replyTo && { reply_to: emailOf(replyTo) }),
        }),
      });

      const answer = apiAnswer.safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !answer.success || !answer.data.success) {
        const [error] = answer.data?.errors ?? [];
        const reason = error ? `${response.status}: ${error.message}` : String(response.status);
        throw Object.assign(new Error(`tenoncms: Cloudflare Email Service answered ${reason}`), {
          code: error?.code,
        });
      }
      if (answer.data.result?.permanent_bounces.length)
        throw new Error("tenoncms: Cloudflare Email Service bounced one or more recipients");
    },
  };
}

function mapRecipients<T>(to: EmailMessage["to"], map: (address: string) => T) {
  return Array.isArray(to) ? to.map(map) : map(to);
}

function toApiAddress(address: string) {
  const parsed = parseAddress(address);
  return typeof parsed === "string" ? parsed : { address: parsed.email, name: parsed.name };
}

function emailOf(address: string) {
  const parsed = parseAddress(address);
  return typeof parsed === "string" ? parsed : parsed.email;
}

// Cloudflare takes a display name only as an object, never inside the string.
function parseAddress(address: string): SendEmailAddress {
  const match = /^"?(.*?)"?\s*<([^<>]+)>$/.exec(address.trim());
  if (!match) return address;
  const [, name, email] = match as unknown as [string, string, string];
  return name ? { name, email } : email;
}
