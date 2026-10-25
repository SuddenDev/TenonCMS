import type { Db } from "../document-sql.ts";

/** Deletes an invite. Whether it existed. */
export async function deleteInvite(db: Db, id: string) {
  const { numDeletedRows } = await db
    .deleteFrom("cms_invites")
    .where("id", "=", id)
    .executeTakeFirst();
  return numDeletedRows > 0n;
}
