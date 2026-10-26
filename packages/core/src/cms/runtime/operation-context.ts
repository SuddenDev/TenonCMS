import type { CmsUser } from "../../admin/index.d.ts";
import { type Core, type Scope, type Inner, type Perspective } from "./types.ts";

/** The scope of a call from outside the CMS: server code (`overrideAccess`) or an HTTP request. */
export const outerScope = (
  user: CmsUser | null,
  perspective?: Perspective,
  overrideAccess = false,
): Scope => ({ user, context: {}, nested: false, perspective, overrideAccess });
/** The `context` of a call: a nested call keeps its caller's, an outer call starts empty. */
export const contextOf = (scope: Scope) => (scope.nested ? scope.context : {});
/**
 * A scope for hooks and nested calls: shares `trx` and `context`, and gets its own bound API. The scope keeps the
 * caller's `overrideAccess`, so the operation checks its caller; the bound API skips the rules, like Payload's.
 */
export function inner(
  core: Core,
  scope: Scope,
  trx: Scope["trx"],
  context: Scope["context"],
): Inner {
  const s: Scope = { ...scope, trx, context, nested: true };
  return { ...s, cms: core.localApi({ ...s, overrideAccess: true }) };
}
