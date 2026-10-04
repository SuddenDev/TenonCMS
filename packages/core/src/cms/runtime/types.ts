import { type Database } from "../../db/types.ts";
import { type MediaCore } from "../../media/core.ts";
import { type Plugin } from "../../plugins/index.ts";
import { type LocalApi, type RootHooks, type Schema } from "../../schema/index.ts";
import type { User } from "better-auth";
import type { Kysely } from "kysely";

/** What the local API needs from its `defineCms()` instance. */
export type Core = {
  /** The host's schema with the plugins' collections and globals. */
  schema: Required<Schema>;
  plugins: readonly Plugin[];
  rootHooks: RootHooks;
  /** The `populate` config with defaults. */
  defaults: { depth: number; maxDepth: number };
  /** Connects and migrates on the first call. */
  db: () => Promise<Kysely<Database>>;
  /** The local API of a scope. */
  bind: (scope: Scope) => LocalApi;
  /** The resolved `media` option. Missing without it. */
  media?: MediaCore;
};
export type Stage = keyof RootHooks;

/** One call of the local API. Calls from inside a hook share `trx`, `user` and `context`. */
export type Scope = {
  trx?: Kysely<Database>;
  user: User | null;
  context: Record<string, unknown>;
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean;
  /** Reads use the drafts perspective. Default: published. */
  drafts?: boolean;
};
/** The scope hooks and nested calls get, with its bound API. */
export type Inner = Scope & { cms: LocalApi };
