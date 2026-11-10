import { Cron } from "croner";
import type { Core } from "../../cms/runtime/types.ts";
import { deleteStaleCronJobs } from "../../db/queries/jobs/delete-jobs.query.ts";
import { type CronSlot, insertCronSlots } from "../../db/queries/jobs/insert-cron-slots.query.ts";
import type { Db } from "../../db/queries/document-sql.ts";

/**
 * Queues the next slot of every cron entry and deletes the rows of entries that are gone from the config.
 *
 * Only the first slot after `now` is seeded. A slot seeded earlier stays queued and runs once on the first tick
 * after it is due, so a server that was down runs a missed slot once and skips the slots after it. A slot is never
 * seeded again after it ran, because it is not after `now` any more. Cron times are server time.
 */
export async function seedCron(core: Core, db: Db, now: number) {
  const { scheduled } = core.jobs;
  await deleteStaleCronJobs(db, scheduled);

  const slots: CronSlot[] = [];
  for (const { cron, task } of scheduled) {
    const next = new Cron(cron).nextRun(new Date(now));
    if (next) slots.push({ cron, task, runAt: next.getTime() });
  }
  await insertCronSlots(db, slots);
}
