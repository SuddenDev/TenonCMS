import type { Db } from "../document-sql.ts";
import { isPostgres } from "../document-sql.ts";

/**
 * The oldest queued job of `task` with `key`. On Postgres the row stays locked until the transaction ends, so a
 * runner skips it (`SKIP LOCKED`) while a caller merges into it.
 * @returns The id and payload, or `undefined` when none waits.
 */
export function findKeyedJob(db: Db, task: string, key: string) {
  let query = db
    .selectFrom("cms_jobs")
    .select(["id", "payload"])
    .where("task", "=", task)
    .where("dedupe_key", "=", key)
    .where("status", "=", "queued")
    .orderBy("run_at")
    .limit(1);
  if (isPostgres(db)) query = query.forUpdate();
  return query.executeTakeFirst();
}

/** Replaces the payload of a job that is still queued. */
export async function setJobPayload(db: Db, id: string, payload: string) {
  await db
    .updateTable("cms_jobs")
    .set({ payload, updated_at: Date.now() })
    .where("id", "=", id)
    .where("status", "=", "queued")
    .execute();
}
