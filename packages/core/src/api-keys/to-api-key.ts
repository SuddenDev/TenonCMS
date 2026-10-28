import type { ApiKeyRow } from "../db/queries/api-keys/find-api-keys.query.ts";
import type { ApiKey } from "./types.ts";

/** The API shape of a key row. better-auth stores dates as ISO strings in SQLite. */
export function toApiKey(row: ApiKeyRow): ApiKey {
  const date = (value: string | number | null) =>
    value == null ? null : new Date(value).toISOString();
  return {
    id: row.id,
    name: row.name,
    start: row.start,
    permissions: row.permissions ? JSON.parse(row.permissions) : {},
    enabled: row.enabled !== 0,
    creator: row.creatorId
      ? { id: row.creatorId, name: row.creatorName!, email: row.creatorEmail! }
      : null,
    createdAt: date(row.createdAt)!,
    lastUsedAt: date(row.lastRequest),
    expiresAt: date(row.expiresAt),
  };
}
