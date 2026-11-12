import type { Scope } from "../cms/runtime/types.ts";
import { ForbiddenError } from "../errors.ts";

/**
 * An archive holds all content and skips the access rules, so only admins and server code reach it.
 * @throws {ForbiddenError} 401 without a user or API key, else 403.
 */
export function requireAdmin(scope: Scope) {
  if (scope.overrideAccess || scope.user?.role === "admin") return;
  throw new ForbiddenError(scope.user || scope.apiKey ? 403 : 401);
}
