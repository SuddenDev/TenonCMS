import { actorId, contextOf, inner } from "../../cms/runtime/operation-context.ts";
import { afterCommit, databaseForScope } from "../../cms/runtime/transaction.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { insertJob } from "../../db/queries/jobs/insert-job.query.ts";
import { findKeyedJob, setJobPayload } from "../../db/queries/jobs/keyed-job.query.ts";
import type { QueueOptions } from "../types.ts";

const MAX_ATTEMPTS = 3;

/** The options of {@link queueJob}: the public ones, and the document a scheduled publish belongs to. */
type QueueJobOptions = QueueOptions & {
  target?: { key: string; docId: string; locale: string | null };
};

/**
 * Inserts a job, or returns the job that waits under `key` (after `merge`). Inside a transaction the job joins it and
 * the clock wakes after the commit; outside one it wakes at once.
 * @returns The id of the job.
 * @throws {Error} For a task that is not defined or a `runAt` that is not a time.
 */
export async function queueJob(
  core: Core,
  scope: Scope,
  task: string,
  payload: unknown,
  { runAt, maxAttempts = MAX_ATTEMPTS, target, key, merge }: QueueJobOptions = {},
) {
  if (!core.jobs.tasks.has(task)) throw new Error(`tenoncms: unknown task "${task}"`);
  const due = runAt === undefined ? Date.now() : new Date(runAt).getTime();
  if (Number.isNaN(due)) throw new Error("tenoncms: `runAt` MUST be a valid time");
  const db = await databaseForScope(core, scope);

  // ponytail: two first calls in concurrent Postgres transactions both insert. A key saves work, it guarantees nothing.
  const queued = key === undefined ? undefined : await findKeyedJob(db, task, key);
  if (queued) {
    if (merge) {
      const merged = await merge(JSON.parse(queued.payload), payload ?? null);
      await setJobPayload(db, queued.id, JSON.stringify(merged ?? null));
    }
    return { id: queued.id };
  }

  const id = await insertJob(db, {
    task,
    payload: JSON.stringify(payload ?? null),
    runAt: due,
    maxAttempts,
    target,
    createdBy: actorId(scope),
    dedupeKey: key,
  });

  const wake = async () => core.jobs.wake(due);
  if (scope.transaction) afterCommit(inner(core, scope, scope.transaction, contextOf(scope)), wake);
  else await wake();
  return { id };
}
