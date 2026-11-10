import type { Db } from "../document-sql.ts";

/** One run of a cron entry, due at `runAt` (epoch milliseconds). */
export type CronSlot = { cron: string; task: string; runAt: number };

/**
 * Queues the slots with one attempt each. The unique index on `(cron, task, run_at)` makes a slot that already
 * exists, running or finished, a no-op. Two runners that seed the same slot create one row.
 */
export async function insertCronSlots(db: Db, slots: CronSlot[]) {
  if (!slots.length) return;
  const now = Date.now();
  await db
    .insertInto("cms_jobs")
    .values(
      slots.map((slot) => ({
        id: crypto.randomUUID(),
        task: slot.task,
        payload: "null",
        status: "queued" as const,
        run_at: slot.runAt,
        attempts: 0,
        max_attempts: 1,
        locked_until: null,
        result: null,
        error: null,
        cron: slot.cron,
        target: null,
        doc_id: null,
        locale: null,
        created_by: null,
        created_at: now,
        updated_at: now,
      })),
    )
    .onConflict((oc) => oc.columns(["cron", "task", "run_at"]).doNothing())
    .execute();
}
