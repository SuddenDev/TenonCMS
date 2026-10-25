import type { Db } from "../document-sql.ts";

/** Deletes and returns the invite with this token hash, unless it expired at `now`. One token claims once. */
export const claimInvite = (db: Db, tokenHash: string, now: number) =>
  db
    .deleteFrom("cms_invites")
    .where("token_hash", "=", tokenHash)
    .where("expires_at", ">", now)
    .returningAll()
    .executeTakeFirst();
