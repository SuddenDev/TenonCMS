import type { Db } from "../document-sql.ts";

/** Deletes the lock if `userId` holds it. A lock someone else took over stays. */
export async function releaseLock(db: Db, target: string, id: string, userId: string) {
  await db
    .deleteFrom("cms_locks")
    .where("target", "=", target)
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .execute();
}
