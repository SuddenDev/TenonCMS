import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * Replaces the hash and the first characters of an enabled key.
 * @returns Whether an enabled key has this id.
 */
export async function replaceApiKeySecret(db: Db, id: string, hash: string, start: string) {
  const { numAffectedRows } = await sql`
    UPDATE apikey SET key = ${hash}, start = ${start}, "updatedAt" = ${new Date().toISOString()}
    WHERE id = ${id} AND enabled = true`.execute(db);
  return (numAffectedRows ?? 0n) > 0n;
}
