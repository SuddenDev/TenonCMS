import type { Db } from "../document-sql.ts";

/** How a run ended. `queued` is a retry. */
export type Outcome =
  | { status: "done"; result: string | null }
  | { status: "queued"; run_at: number; error: string }
  | { status: "failed"; error: string };

/** Records how a run ended and releases the lease. */
export async function finishJob(db: Db, id: string, outcome: Outcome) {
  await db
    .updateTable("cms_jobs")
    .set({ ...outcome, locked_until: null, updated_at: Date.now() })
    .where("id", "=", id)
    .execute();
}
