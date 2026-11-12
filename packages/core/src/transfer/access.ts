import type { ApiKeyOp } from "../api-keys/types.ts";
import type { Scope } from "../cms/runtime/types.ts";
import { ForbiddenError } from "../errors.ts";

/**
 * An archive holds all content and skips the access rules, so only admins, server code and API keys with the
 * `backup` permission reach it. A key needs `read` to export and `update` to import.
 * @throws {ForbiddenError} 401 without a user or API key, else 403.
 */
export function requireBackup(scope: Scope, op: Extract<ApiKeyOp, "read" | "update">) {
  if (scope.overrideAccess || scope.user?.role === "admin") return;
  if (scope.apiKey?.permissions.backup?.includes(op)) return;
  throw new ForbiddenError(scope.user || scope.apiKey ? 403 : 401);
}
