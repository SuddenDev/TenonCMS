import type { CmsUser } from "../../admin/index.d.ts";
import type { ApiKeyCaller } from "../../api-keys/types.ts";
import type { AdminRuntime } from "../../admin/merge/merge-options.ts";
import type { Localization } from "../config/options.ts";
import type { MediaCore } from "../../media/runtime/create-media-core.ts";
import type { EmailApi, EmailTemplates } from "../../email/types.ts";
import type { Role } from "../../users/roles.ts";
import { type Plugin } from "../../plugins/index.ts";
import { type LocalApi, type RootHooks, type Schema } from "../../schema/index.ts";
import type { BetterAuthOptions } from "better-auth";
import type { Database } from "../../db/types.ts";
import type { Kysely } from "kysely";
import type { TransactionLifetime } from "./transaction.ts";
import type { RobotsOptions, SitemapOptions } from "../../seo/config/types.ts";
import type { ResolvedJobs } from "../../jobs/config/resolve-jobs.ts";
import type { ResolvedWebhooks } from "../../webhooks/config/resolve-webhooks.ts";

/**
 * The internal context of one `defineCms()` instance. It is not public.
 * The local API, hooks and HTTP routes read the schema, hooks, defaults, database, auth and media from it.
 */
export type Core = {
  /** The host's schema with the plugins' collections and globals. */
  schema: Required<Schema>;
  plugins: readonly Plugin[];
  rootHooks: RootHooks;
  /** The `populate` config with defaults. */
  populate: { depth: number; maxDepth: number };
  /** Connects and migrates on the first call. */
  db: () => Promise<Kysely<Database>>;
  /** Creates better-auth on the first call. */
  auth: () => Promise<{ handler(request: Request): Promise<Response>; options: BetterAuthOptions }>;
  /** The session of a request's headers, or `null`. */
  getSession: (headers: Headers) => Promise<{ user: CmsUser } | null>;
  /** The key of an API key's secret, or `null` for a key that is not valid. */
  getApiKey: (key: string) => Promise<ApiKeyCaller | null>;
  /**
   * The local API of a scope. It sits on `Core`, so operations can create nested APIs for hooks without importing
   * every operation, which would be an import cycle.
   */
  localApi: (scope: Scope) => LocalApi;
  /** The `localization` option with defaults. Missing without it. */
  localization?: Localization;
  /** The resolved `media` option. Missing without it. */
  media?: MediaCore;
  /** Instance-owned server-side delivery. Rejects without email configuration. */
  email: EmailApi;
  /** The built-in email templates with the host's replacements. Missing without email configuration. */
  emailTemplates?: EmailTemplates;
  /** The built-in roles, then the host's. */
  roles: Role[];
  /** Whether the built-in `translations` global holds the default sync state of each entry. */
  translations: boolean;
  /** The `sitemap` option, `{}` by default. `false` turns `/sitemap.xml` off. */
  sitemap: SitemapOptions | false;
  /** The `robots` option, `{}` by default. `false` turns `/robots.txt` off. */
  robots: RobotsOptions | false;
  /**
   * The merged tasks and cron entries. `wake(at)` tells the host's clock that a job is due at `at` (epoch
   * milliseconds). The default does nothing.
   */
  jobs: ResolvedJobs & { wake: (at: number) => void };
  /** The checked `webhooks` option, `{}` without it. */
  webhooks: ResolvedWebhooks;

  /**
   * The merged admin registrations of the plugins and the host: the `/schema` descriptor, the loaders, and the
   * bar. `admin.bar` is `false` with `admin: { adminBar: false }`, which mounts no `/admin-bar` route.
   */
  admin: AdminRuntime;
};
export type Stage = keyof RootHooks;

/**
 * Which version of a document reads return.
 * - `published`: only published documents, with their published data.
 * - `drafts`: every document, with its pending draft where one exists.
 */
export type Perspective = "published" | "drafts";

/** Who calls over HTTP or `withSession()`: a session's user, an API key, or neither. */
export type Caller = { user: CmsUser | null; apiKey?: ApiKeyCaller; perspective: Perspective };

/** One call of the local API. Calls from inside a hook share a transaction lifetime, `user` and `context`. */
export type Scope = {
  transaction?: TransactionLifetime;
  user: CmsUser | null;
  /** The API key of the call. A key caller has no `user`. */
  apiKey?: ApiKeyCaller;
  context: Record<string, unknown>;
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean;
  /** Default: `published`. */
  perspective?: Perspective;
  /** The locale of the call. Default: `localization.defaultLocale`. Missing without `localization`. */
  locale?: string;
  /** Whether a missing value or locale reads as the default locale's. Default: `localization.fallback`. */
  fallback?: boolean;
  /** Skips the access rules: server code and the `cms` of hooks. HTTP and `withSession()` MUST NOT set it. */
  overrideAccess: boolean;
};
/** The scope hooks and nested calls get, with its bound API. */
export type Inner = Scope & { cms: LocalApi };
