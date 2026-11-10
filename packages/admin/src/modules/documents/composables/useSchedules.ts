import { computed, ref, watch } from "vue";
import { client } from "@/shared/api";
import { listScheduled, scheduledAction, type JobTarget } from "@/modules/jobs/jobs";
import type { Job } from "../../../../../core/src/jobs/types";
import type { ScheduleAction } from "../../../../../core/src/schedule/types";

/**
 * The scheduled publishes and unpublishes of one document or global.
 * @param target The document, or `undefined` when scheduling is off for it: nothing loads then.
 * @param locale The active language, or `undefined` for an entry without languages.
 */
export function useSchedules(
  target: () => JobTarget | undefined,
  locale: () => string | undefined,
) {
  const jobs = ref<Job[]>([]);
  // The server keeps at most one queued publish per document and language.
  const publishJob = computed(() =>
    jobs.value.find(
      (job) => scheduledAction(job) === "publish" && (job.locale ?? undefined) === locale(),
    ),
  );
  const key = computed(() => {
    const t = target();
    return t && `${t.kind}:${t.name}:${t.id ?? ""}`;
  });

  // A later load wins, so a quick switch between documents shows the last one.
  let loads = 0;
  async function refresh() {
    const at = ++loads;
    const t = target();
    const list = t ? await listScheduled(t).catch(() => []) : [];
    if (at === loads) jobs.value = list;
  }
  watch(key, refresh, { immediate: true });

  /**
   * Queues the action once per locale. `locales` holds `undefined` for an entry without languages.
   * A time in the past runs each job at once.
   * @throws {Error} With the job's error when a job that ran at once failed. It stays queued for its retry.
   */
  async function schedule(action: ScheduleAction, at: string, locales: (string | undefined)[]) {
    const t = target()!;
    const now = Date.parse(at) <= Date.now();
    try {
      for (const locale of locales) {
        const options = { action, at, locale };
        const { id } =
          t.kind === "global"
            ? await client.scheduleGlobal(t.name, options)
            : await client.schedule(t.name, t.id!, options);
        if (!now) continue;

        const job = await client.jobs.run(id);
        if (job.status !== "done") throw new Error(job.error ?? job.status);
      }
    } finally {
      await refresh();
    }
  }

  async function cancel(id: string) {
    await client.jobs.cancel(id);
    await refresh();
  }

  /** Cancels the scheduled publish of the active language, if there is one. Call it after a publish. */
  async function cancelPublish() {
    if (publishJob.value) await cancel(publishJob.value.id);
  }

  return { jobs, publishJob, refresh, schedule, cancel, cancelPublish };
}

export type Schedules = ReturnType<typeof useSchedules>;
