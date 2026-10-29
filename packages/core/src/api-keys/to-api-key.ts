import type { ApiKeyRow } from "../db/queries/api-keys/find-api-keys.query.ts";
import type { ApiKey } from "./types.ts";

/** The API shape of a key row. */
export function toApiKey(row: ApiKeyRow): ApiKey {
  const date = (value: string | number | Date | null) =>
    value == null ? null : new Date(value).toISOString();
  return {
    id: row.id,
    name: row.name,
    start: row.start,
    permissions: row.permissions ? JSON.parse(row.permissions) : {},
    enabled: row.enabled !== 0 && row.enabled !== false,
    creator: row.creatorId
      ? { id: row.creatorId, name: row.creatorName!, email: row.creatorEmail! }
      : null,
    createdAt: date(row.createdAt)!,
    lastUsedAt: date(row.lastRequest),
    expiresAt: date(row.expiresAt),
  };
}
