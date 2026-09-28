import type { User } from "better-auth";
import type { Kysely } from "kysely";
import type { Database } from "../db/index.ts";
import type { Plugin } from "../plugins/index.ts";
import { list } from "../schema/hooks/run.ts";
import type { LocalApi, RootHooks, Schema } from "../schema/index.ts";

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
};

/** The target of an operation. Hooks get it as `collection` or `global`. */
export type Name = { kind: "collection" | "global"; name: string };
export const col = (name: string): Name => ({ kind: "collection", name });
export const glob = (name: string): Name => ({ kind: "global", name });

export type Stage = keyof RootHooks;

/** One call of the local API. Calls from inside a hook share `trx`, `user` and `context`. */
export type Scope = {
  trx?: Kysely<Database>;
  user: User | null;
  context: Record<string, unknown>;
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean;
};
/** The scope hooks and nested calls get, with its bound API. */
export type Inner = Scope & { cms: LocalApi };

/** The transaction of the scope, or a plain connection. */
export const q = async (core: Core, s: Scope) => s.trx ?? (await core.db());

/** The fields and hooks of a collection or global. */
export const target = ({ schema }: Core, { kind, name }: Name) =>
  kind === "collection" ? schema.collections[name] : schema.globals[name];

/** Throws for an unknown collection or global. */
export function known({ schema }: Core, kind: Name["kind"], name: string) {
  const owners = kind === "collection" ? schema.collections : schema.globals;
  if (!Object.hasOwn(owners, name)) throw new Error(`Unknown ${kind} "${name}"`);
}

/** The hooks of a stage: the collection's or global's, then the plugins', then the host's root hooks. */
export const slot = (core: Core, name: Name, stage: Stage): ((args: any) => unknown)[] => [
  ...list<(args: any) => unknown>((target(core, name).hooks as RootHooks | undefined)?.[stage]),
  ...core.plugins.flatMap((p) => list<(args: any) => unknown>(p.hooks?.[stage])),
  ...list<(args: any) => unknown>(core.rootHooks[stage]),
];

/** The arguments every hook gets, plus `extra`. */
export const hookArgs = <E extends object>(s: Inner, name: Name, extra: E) => ({
  cms: s.cms,
  user: s.user,
  context: s.context,
  [name.kind]: name.name,
  ...extra,
});

/** A scope for hooks and nested calls: shares `trx` and `context`, and gets its own bound API. */
export function inner(
  core: Core,
  scope: Scope,
  trx: Scope["trx"],
  context: Scope["context"],
): Inner {
  const s: Scope = { ...scope, trx, context, nested: true };
  return { ...s, cms: core.bind(s) };
}
