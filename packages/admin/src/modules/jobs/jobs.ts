import type { Job } from "../../../../core/src/jobs/types";
import type { ScheduleAction } from "../../../../core/src/schedule/types";
import { client } from "@/shared/api";
import { CONTENT } from "@/shared/options";

const enc = encodeURIComponent;

/** A collection document or a global that jobs can belong to. */
export type JobTarget = { kind: "collection" | "global"; name: string; id?: string };

/** The queued jobs of one document or global: its scheduled publishes and unpublishes. */
export const listScheduled = ({ kind, name, id }: JobTarget) =>
  client.jobs.list({ status: "queued", target: `${kind}:${name}`, docId: id ?? "", limit: 500 });

/** The queued jobs of a whole collection, grouped by document id. One request instead of one per row. */
export async function listScheduledByDoc(collection: string) {
  const jobs = await client.jobs.list({
    status: "queued",
    target: `collection:${collection}`,
    limit: 500,
  });
  return groupByDoc(jobs);
}

export function groupByDoc(jobs: Job[]) {
  const byDoc = new Map<string, Job[]>();
  for (const job of jobs) {
    if (!job.docId) continue;
    byDoc.set(job.docId, [...(byDoc.get(job.docId) ?? []), job]);
  }
  return byDoc;
}

/** What a built-in job does: `tenon:publish` or `tenon:unpublish`. Any other task gives `undefined`. */
export function scheduledAction(job: Pick<Job, "task">): ScheduleAction | undefined {
  if (job.task === "tenon:publish") return "publish";
  if (job.task === "tenon:unpublish") return "unpublish";
  return undefined;
}

/**
 * Joins the scheduled jobs that run the same action at the same time, so all languages released together read as one.
 * Ordered by time. Jobs of other tasks are left out. `locales` is empty for an entry without languages.
 */
export function groupSchedules(jobs: Job[]) {
  const groups = new Map<string, { action: ScheduleAction; runAt: string; locales: string[] }>();
  for (const job of [...jobs].sort((a, b) => a.runAt.localeCompare(b.runAt))) {
    const action = scheduledAction(job);
    if (!action) continue;
    const key = `${action} ${job.runAt}`;
    const group = groups.get(key) ?? { action, runAt: job.runAt, locales: [] };
    if (job.locale) group.locales.push(job.locale);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The runs of a job: "2" once it is done, else with the limit, as in "1 / 3". */
export const jobAttempts = (job: Pick<Job, "status" | "attempts" | "maxAttempts">) =>
  job.status === "done" ? String(job.attempts) : `${job.attempts} / ${job.maxAttempts}`;

export type JobAction = "run" | "retry" | "cancel";

/**
 * The actions a row offers. A running or done job offers none. A cron row never offers Cancel, because the next tick
 * queues its slot again.
 */
export function jobActions(job: Pick<Job, "status" | "cron">): JobAction[] {
  if (job.status === "queued") return job.cron ? ["run"] : ["run", "cancel"];
  if (job.status === "failed") return job.cron ? ["run", "retry"] : ["run", "retry", "cancel"];
  return [];
}

type Entries = {
  collections?: Record<string, unknown>;
  globals?: Record<string, { nav?: { display?: string } }>;
};

/**
 * The admin route of a job's document or global.
 * @returns `undefined` for a job without a target, or one whose collection or global is not in the schema.
 */
export function jobTargetLink(job: Pick<Job, "target" | "docId">, schema: Entries) {
  const colon = job.target?.indexOf(":") ?? -1;
  if (!job.target || colon < 0) return undefined;

  const kind = job.target.slice(0, colon);
  const name = job.target.slice(colon + 1);
  if (kind === "collection" && schema.collections?.[name] && job.docId)
    return { kind, name, to: `${CONTENT}/collections/${enc(name)}/${enc(job.docId)}` };
  if (kind === "global" && schema.globals?.[name]) {
    const settings = schema.globals[name].nav?.display === "settings";
    return { kind, name, to: `${CONTENT}/${settings ? "settings/" : ""}globals/${enc(name)}` };
  }
  return undefined;
}
