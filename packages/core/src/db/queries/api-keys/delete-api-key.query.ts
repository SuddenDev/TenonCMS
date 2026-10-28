import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * Deletes an API key.
 * @returns Whether a key was deleted.
 */
export async function deleteApiKeyRow(db: Db, id: string) {
  const { numAffectedRows } = await sql`DELETE FROM apikey WHERE id = ${id}`.execute(db);
  return (numAffectedRows ?? 0n) > 0n;
}
