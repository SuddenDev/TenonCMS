import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * When the clock MUST run next: the earliest due queued job or the earliest lease that ends.
 * @returns Epoch milliseconds, or `null` without one.
 */
export async function nextJobTime(db: Db) {
  const { rows } = await sql<{ next: number | null }>`
    SELECT MIN(CASE status WHEN 'queued' THEN run_at ELSE locked_until END) AS next
    FROM cms_jobs WHERE status IN ('queued', 'running')`.execute(db);
  return rows[0].next === null ? null : Number(rows[0].next);
}
