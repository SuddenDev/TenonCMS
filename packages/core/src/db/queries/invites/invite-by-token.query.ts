import type { Db } from "../document-sql.ts";

/** The invite with this token hash, unless it expired at `now`. */
export const inviteByToken = (db: Db, tokenHash: string, now: number) =>
  db
    .selectFrom("cms_invites")
    .selectAll()
    .where("token_hash", "=", tokenHash)
    .where("expires_at", ">", now)
    .executeTakeFirst();
