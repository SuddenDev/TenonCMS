import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * A row of better-auth's `apikey` table with its creator, as {@link findApiKeys} reads it. SQLite stores booleans as
 * numbers and dates as ISO strings; Postgres returns booleans and `Date`s.
 */
export type ApiKeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  permissions: string | null;
  enabled: number | boolean | null;
  createdAt: string | number | Date;
  lastRequest: string | number | Date | null;
  expiresAt: string | number | Date | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
};

/**
 * API keys with their creators, oldest first. Never the key hash.
 * @param id Only this key.
 */
export async function findApiKeys(db: Db, id: string | null = null) {
  const { rows } = await sql<ApiKeyRow>`
    SELECT k.id, k.name, k.start, k.permissions, k.enabled, k."createdAt", k."lastRequest", k."expiresAt",
      u.id AS "creatorId", u.name AS "creatorName", u.email AS "creatorEmail"
    FROM apikey k LEFT JOIN "user" u ON u.id = k."referenceId"
    WHERE ${id === null ? sql`TRUE` : sql`k.id = ${id}`}
    ORDER BY k."createdAt", k.id`.execute(db);
  return rows;
}
