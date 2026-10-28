import { sql } from "kysely";
import type { Db } from "../document-sql.ts";

/**
 * Gives the lock to `userId` when it is free, expired, already theirs, or `takeover` is set; else leaves it.
 * One statement, so two claims cannot both win.
 * @returns The holder after the claim, with their name. `''` for a user that no longer exists.
 */
export async function claimLock(
  db: Db,
  lock: { target: string; id: string; userId: string; takeover: boolean; expiredBefore: number },
) {
  const now = Date.now();
  await sql`INSERT INTO cms_locks (target, id, user_id, locked_at)
    VALUES (${lock.target}, ${lock.id}, ${lock.userId}, ${now})
    ON CONFLICT (target, id) DO UPDATE SET user_id = excluded.user_id, locked_at = excluded.locked_at
    WHERE cms_locks.user_id = excluded.user_id OR cms_locks.locked_at < ${lock.expiredBefore}
      OR ${lock.takeover ? 1 : 0} = 1`.execute(db);

  const { rows } = await sql<{ user_id: string; name: string | null }>`
    SELECT cms_locks.user_id, "user".name FROM cms_locks LEFT JOIN "user" ON "user".id = cms_locks.user_id
    WHERE cms_locks.target = ${lock.target} AND cms_locks.id = ${lock.id}`.execute(db);
  return { id: rows[0].user_id, name: rows[0].name ?? "" };
}
