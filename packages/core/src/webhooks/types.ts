import type { Awaitable } from "../schema/hooks/index.ts";

export type WebhookEvent = "create" | "update" | "delete";

/** One change in a delivery. `collection` and `id` for a document, `global` for a global. */
export type WebhookBody = {
  event: WebhookEvent;
  collection?: string;
  id?: string;
  global?: string;
  /** `null` without `localization`. */
  locale: string | null;
  /** Whether the entry is published after the change. `false` on delete. */
  published: boolean;
  /** The public URL after the change. `null` on delete and without a `permalink`. */
  permalink: string | null;
  /** The public URL before the change. `null` on create and without a `permalink`. */
  previousPermalink: string | null;
  /** When the change happened, as an ISO string. */
  at: string;
};

/** A change with the stored documents, relations as ids. What `payload: "full"` sends and a `payload` function gets. */
export type WebhookChange = WebhookBody & {
  /** `null` on delete. */
  doc: Record<string, any> | null;
  /** `null` on create. */
  previousDoc: Record<string, any> | null;
};

/**
 * The body of one request: the changes it carries, one without `debounce`. `truncated` is `true` when a debounce
 * window held more than 1000 changes and the rest were dropped; a receiver SHOULD then treat everything as changed.
 */
export type WebhookBatch<C = WebhookBody> = { changes: C[]; truncated: boolean };

/** One outgoing webhook. Tenon POSTs JSON to `url` after each matching change of published content. */
export type Webhook = {
  /** Read it from an env var. A URL with a token (a deploy hook) never leaves the config. */
  url: string;
  /** Collections that send. Without `collections` and `globals`, every collection and global sends. */
  collections?: readonly string[];
  /** Globals that send. Without `collections` and `globals`, every collection and global sends. */
  globals?: readonly string[];
  /** Default: all. Draft saves send nothing; an unpublish is an `update` with `published: false`. */
  events?: readonly WebhookEvent[];
  /**
   * The body: a {@link WebhookBatch}. `"minimal"` (default) sends {@link WebhookBody} changes, `"full"`
   * {@link WebhookChange} changes. A function gets the full batch when the job sends and returns the body, such as
   * the JSON of a chat service.
   */
  payload?: "minimal" | "full" | ((batch: WebhookBatch<WebhookChange>) => Awaitable<unknown>);
  /**
   * Seconds to collect changes into one request. The first change opens the window, later ones join it without
   * moving it, so the delay is at most `debounce` plus one clock tick. Missing: one request per change.
   */
  debounce?: number;
  /**
   * Signs each request with Standard Webhooks headers. A `whsec_<base64>` secret or a plain string of at least 24
   * bytes. A list signs with every secret, so receivers can rotate. Missing: no signature.
   */
  secret?: string | readonly string[];
  /** Extra request headers, such as `authorization`. */
  headers?: Record<string, string>;
};

/** The `webhooks` option of `defineCms()`, keyed by name. */
export type WebhooksOptions = Record<string, Webhook>;
