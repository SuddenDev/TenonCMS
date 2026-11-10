import { guard } from "../../access/rule.ts";
import { contextOf, inner } from "../../cms/runtime/operation-context.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { withLocale } from "../../content/locale.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import type { DocData } from "../../db/queries/document-sql.ts";
import { loadSource } from "../../content/writes/write-document.ts";
import { type ContentTarget, target, targetKey } from "../../content/targets.ts";
import { ValidationError } from "../../errors.ts";
import { deleteQueuedTargetJobs } from "../../db/queries/jobs/delete-jobs.query.ts";
import { queueJob } from "../../jobs/operations/queue.operation.ts";
import { SCHEDULE_ACTIONS, type ScheduledPayload, type ScheduleOptions } from "../types.ts";

/**
 * Queues a publish or an unpublish of a document or global for a later time. The job joins the scope's transaction and
 * replaces a queued job of the same action, document and locale.
 * It needs the `update` rule now; the job itself runs as the server, so the rule is not checked again when it fires.
 * @param id The document id. Missing for a global.
 * @returns The id of the job, or `undefined` when the collection document does not exist. A draft-only document exists.
 * A time in the past is due at once: the next `cms.jobs.run()` fires it.
 * @throws {ValidationError} When the entry has no `schedule` option, `action` or `locale` is unknown, `at` is not a
 * valid time, or a publish finds nothing to publish in the locale.
 * @throws {ForbiddenError} When the `update` rule denies.
 */
export async function scheduleJob(
  core: Core,
  scope: Scope,
  name: ContentTarget,
  id: string | undefined,
  { action, at, locale }: ScheduleOptions,
) {
  const entry = target(core, name);
  if (!entry.schedule) throw new ValidationError({ "": `Scheduling is off for "${name.name}"` });

  const s = withLocale(core, scope, { locale });
  await guard(core, inner(core, s, s.transaction, contextOf(s)), name, "update", { id });

  const db = await databaseForScope(core, s);
  const loc = await locOf(core, { ...s, fallback: false }, name);
  const doc = await loadSource(db, name, id, true, loc);
  if (!doc && name.kind === "collection") return undefined;

  if (!SCHEDULE_ACTIONS.includes(action)) throw new ValidationError({ action: "Unknown action" });
  const due = new Date(at).getTime();
  if (Number.isNaN(due)) throw new ValidationError({ at: "MUST be a valid time" });
  if (action === "publish" && !hasUnpublished(doc, loc?.locale))
    throw new ValidationError({ "": "Nothing to publish" });

  const key = targetKey(name);
  const payload: ScheduledPayload = {
    kind: name.kind,
    name: name.name,
    id,
    locale: entry.localized && core.localization ? (s.locale ?? null) : null,
  };
  const task = `tenon:${action}`;
  const jobTarget = { key, docId: id ?? "", locale: payload.locale };
  await deleteQueuedTargetJobs(db, task, jobTarget);
  return queueJob(core, s, task, payload, { runAt: due, target: jobTarget });
}

// A localized document needs a row in the locale, with its own draft, no publication yet, or a shared draft.
function hasUnpublished(doc: DocData | undefined, locale: string | undefined) {
  if (!doc || (locale && !doc.locales.includes(locale))) return false;
  return doc.hasDraft || doc.publishedAt === null || doc.sharedDraft === true;
}
