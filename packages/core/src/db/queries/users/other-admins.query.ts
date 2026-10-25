import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/** How many users other than `userId` have the role `admin` and are not banned. */
export async function otherAdmins(db: Db, userId: string) {
  const { rows } = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM "user"
    WHERE role = 'admin' AND (banned IS NULL OR banned = 0) AND id <> ${userId}`.execute(db);
  return Number(rows[0].n);
}
