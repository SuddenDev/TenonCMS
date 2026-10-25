import type { Db } from "../document-sql.ts";

/** Every invite, oldest first, expired ones included. */
export const findInvites = (db: Db) =>
  db.selectFrom("cms_invites").selectAll().orderBy("created_at").orderBy("id").execute();
