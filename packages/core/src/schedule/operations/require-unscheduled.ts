import type { Db } from "../../db/queries/document-sql.ts";
import { findJobs } from "../../db/queries/jobs/find-jobs.query.ts";
import { type ContentTarget, targetKey } from "../../content/targets.ts";
import { ValidationError } from "../../errors.ts";

/**
 * Locks the draft of a scheduled publish: a draft save, discard or locale removal MUST NOT change what the job will
 * publish.
 * @param locale The locale whose draft changes, or `undefined` when every locale's draft does.
 * @throws {ValidationError} When a publish of the document is queued for `locale`, or for any locale without it.
 */
export async function requireUnscheduled(
  db: Db,
  name: ContentTarget,
  id: string | undefined,
  locale?: string,
) {
  const jobs = await findJobs(db, {
    status: "queued",
    task: "tenon:publish",
    target: targetKey(name),
    docId: id ?? "",
  });
  if (jobs.some((job) => locale === undefined || job.locale === null || job.locale === locale))
    throw new ValidationError({ "": "A publish is scheduled. Cancel it first." });
}
