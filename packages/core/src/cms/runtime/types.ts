import { type Database } from "../../db/types.ts";
import type { MediaCore } from "../../media/runtime/create-media-core.ts";
import { type Plugin } from "../../plugins/index.ts";
import type { AdminBarOptions } from "../../preview/config/admin-bar.ts";
import { type LocalApi, type RootHooks, type Schema } from "../../schema/index.ts";
import type { BetterAuthOptions, User } from "better-auth";
import type { Kysely } from "kysely";

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
  /** Creates better-auth on the first call. Throws for a bad `secret`. */
  auth: () => Promise<{ handler(request: Request): Promise<Response>; options: BetterAuthOptions }>;
  /** The session of a request's headers, or `null`. */
  getSession: (headers: Headers) => Promise<{ user: User } | null>;
  /**
   * The local API of a scope. It sits on `Core`, so operations can create nested APIs for hooks without importing
   * every operation, which would be an import cycle.
   */
  localApi: (scope: Scope) => LocalApi;
  /** The resolved `media` option. Missing without it. */
  media?: MediaCore;
  /** The `adminBar` option. `false` mounts no `/admin-bar` route. */
  adminBar: false | AdminBarOptions;
};
export type Stage = keyof RootHooks;

/**
 * Which version of a document reads return.
 * - `published`: only published documents, with their published data.
 * - `drafts`: every document, with its pending draft where one exists.
 */
export type Perspective = "published" | "drafts";

/** One call of the local API. Calls from inside a hook share `trx`, `user` and `context`. */
export type Scope = {
  trx?: Kysely<Database>;
  user: User | null;
  context: Record<string, unknown>;
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean;
  /** Default: `published`. */
  perspective?: Perspective;
};
/** The scope hooks and nested calls get, with its bound API. */
export type Inner = Scope & { cms: LocalApi };
