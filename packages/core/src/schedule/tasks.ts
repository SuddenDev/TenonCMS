import { defineTask } from "../jobs/config/define-task.ts";
import type { ScheduledPayload } from "./types.ts";

/**
 * The built-in tasks behind `schedule()`. Both act on the document as it is when the job runs, with the server `cms`,
 * and return `"missing"` for a document that is gone, so the job is done and not retried.
 */
export const scheduleTasks = {
  "tenon:publish": defineTask({
    meta: { description: "Publishes a document or global at the scheduled time" },
    async run({ payload, cms }) {
      const { kind, name, id, locale } = payload as ScheduledPayload;
      const options = { locale: locale ?? undefined };
      const doc =
        kind === "global"
          ? await cms.publishGlobal(name, options)
          : await cms.publish(name, id!, options);
      return doc ? "published" : "missing";
    },
  }),

  "tenon:unpublish": defineTask({
    meta: { description: "Unpublishes a document or global at the scheduled time" },
    async run({ payload, cms }) {
      const { kind, name, id, locale } = payload as ScheduledPayload;
      const options = { locale: locale ?? undefined };
      const doc =
        kind === "global"
          ? await cms.unpublishGlobal(name, options)
          : await cms.unpublish(name, id!, options);
      return doc ? "unpublished" : "missing";
    },
  }),
};
