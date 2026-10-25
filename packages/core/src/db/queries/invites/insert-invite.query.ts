import type { InviteRow } from "../../types.ts";
import type { Db } from "../document-sql.ts";

/** Inserts an invite. Throws when the email or token hash is taken. */
export async function insertInvite(db: Db, invite: InviteRow) {
  await db.insertInto("cms_invites").values(invite).execute();
}
