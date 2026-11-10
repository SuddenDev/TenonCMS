import { consola } from "consola";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { JobRow } from "../../db/types.ts";
import { deleteOlderCronRuns } from "../../db/queries/jobs/delete-jobs.query.ts";
import { finishJob, type Outcome } from "../../db/queries/jobs/finish-job.query.ts";

const BACKOFF = 60_000;

/**
 * Runs a claimed job with the server `cms`, then records the outcome: done, queued again after a backoff of
 * `60 s * 2^(attempts - 1)`, or failed once the attempts are used up. A throwing task never throws out of here.
 * A finished cron run replaces the older finished runs of its entry.
 */
export async function executeJob(core: Core, job: JobRow) {
  const db = await core.db();
  const outcome = await outcomeOf(core, job);
  await finishJob(db, job.id, outcome);
  if (outcome.status !== "queued") await deleteOlderCronRuns(db, job);
}

async function outcomeOf(core: Core, job: JobRow): Promise<Outcome> {
  // Only a lease that expired on the last attempt gets here: the run never reached `finishJob()`.
  if (job.attempts > job.max_attempts)
    return { status: "failed", error: "The lease expired on the last attempt" };

  let result: unknown;
  try {
    const task = core.jobs.tasks.get(job.task);
    if (!task) throw new Error(`Unknown task "${job.task}"`);

    result = await task.run({
      payload: JSON.parse(job.payload),
      cms: core.localApi(outerScope({ user: null }, true)),
      job: { id: job.id, attempts: job.attempts },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    consola.withTag("tenon").error(`Job ${job.id} (${job.task}) failed: ${message}`);
    return job.attempts < job.max_attempts
      ? {
          status: "queued",
          run_at: Date.now() + BACKOFF * 2 ** (job.attempts - 1),
          error: message,
        }
      : { status: "failed", error: message };
  }

  // The task ran, so a result that is not JSON MUST NOT count as a failed attempt.
  try {
    return { status: "done", result: JSON.stringify(result) ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    consola
      .withTag("tenon")
      .warn(
        `Job ${job.id} (${job.task}) returned a value that is not JSON, result dropped: ${message}`,
      );
    return { status: "done", result: null };
  }
}
