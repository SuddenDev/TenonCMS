import type { User } from "better-auth";
import { type Core, type Scope, type Inner, type Perspective } from "./types.ts";

/** The scope of a call from outside the CMS: server code or an HTTP request. */
export const outerScope = (user: User | null, perspective?: Perspective): Scope => ({
  user,
  context: {},
  nested: false,
  perspective,
});
/** The `context` of a call: a nested call keeps its caller's, an outer call starts empty. */
export const contextOf = (scope: Scope) => (scope.nested ? scope.context : {});
/** A scope for hooks and nested calls: shares `trx` and `context`, and gets its own bound API. */
export function inner(
  core: Core,
  scope: Scope,
  trx: Scope["trx"],
  context: Scope["context"],
): Inner {
  const s: Scope = { ...scope, trx, context, nested: true };
  return { ...s, cms: core.localApi(s) };
}
