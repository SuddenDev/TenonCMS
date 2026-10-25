import type { Db } from "../document-sql.ts";

/** The invite for a lowercase email, expired or not. */
export const inviteByEmail = (db: Db, email: string) =>
  db.selectFrom("cms_invites").selectAll().where("email", "=", email).executeTakeFirst();
