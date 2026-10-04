import { type Core, type Scope, type Inner } from "./types.ts";

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
  return { ...s, cms: core.bind(s) };
}
