import { type Caller, type Core, type Scope, type Inner } from "./types.ts";

/** The scope of a call from outside the CMS: server code (`overrideAccess`) or an HTTP request. */
export const outerScope = (
  { user, apiKey, perspective }: Partial<Caller> & Pick<Caller, "user">,
  overrideAccess = false,
): Scope => ({ user, apiKey, context: {}, nested: false, perspective, overrideAccess });

/** Who `createdBy` and `updatedBy` record: the user's id, `key:<id>` for an API key, or `null`. */
export const actorId = (scope: Scope) =>
  scope.apiKey ? `key:${scope.apiKey.id}` : (scope.user?.id ?? null);
/** The `context` of a call: a nested call keeps its caller's, an outer call starts empty. */
export const contextOf = (scope: Scope) => (scope.nested ? scope.context : {});
/**
 * A scope for hooks and nested calls: shares its transaction lifetime and `context`, and gets its own bound API. The scope keeps the
 * caller's `overrideAccess`, so the operation checks its caller; the bound API skips the rules, like Payload's.
 */
export function inner(
  core: Core,
  scope: Scope,
  transaction: Scope["transaction"],
  context: Scope["context"],
): Inner {
  const s: Scope = { ...scope, transaction, context, nested: true };
  return { ...s, cms: core.localApi({ ...s, overrideAccess: true }) };
}
