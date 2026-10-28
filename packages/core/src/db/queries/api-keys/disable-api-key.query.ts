import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * Sets `enabled` to false, so better-auth refuses the key.
 * @returns Whether a key has this id.
 */
export async function disableApiKey(db: Db, id: string) {
  const { numAffectedRows } = await sql`UPDATE apikey SET enabled = 0 WHERE id = ${id}`.execute(db);
  return (numAffectedRows ?? 0n) > 0n;
}
