import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/** Whether a user has this email. better-auth stores emails lowercase. */
export async function userExists(db: Db, email: string) {
  const { rows } = await sql<{ n: number }>`
    SELECT EXISTS (SELECT 1 FROM "user" WHERE email = ${email}) AS n`.execute(db);
  return !!rows[0].n;
}
