import type { Db } from "../document-sql.ts";

/** Gives an invite a new token hash and expiry, so the old token stops working. The renewed invite, if it exists. */
export const renewInvite = (db: Db, id: string, tokenHash: string, expiresAt: number) =>
  db
    .updateTable("cms_invites")
    .set({ token_hash: tokenHash, expires_at: expiresAt })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
