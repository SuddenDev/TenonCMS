<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Job } from "../../../../../core/src/jobs/types";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { localeLabel } from "@/shared/locale";
import { formatDateTime } from "@/shared/utils";
import { Separator } from "@/shared/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { jobAttempts } from "../jobs";
import JobCode from "./JobCode.vue";
import JobStatus from "./JobStatus.vue";

// Everything one job holds, on one pane. `target` is the resolved link of the job's document or global, if it has one.
const props = defineProps<{
  job?: Job;
  target?: { to: string; label: string };
}>();
const open = defineModel<boolean>("open", { required: true });
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();

const date = (iso: string) => formatDateTime(iso, locale.value, timeZone.value);
const json = (value: unknown) => JSON.stringify(value, null, 2) ?? "null";
const dash = "–";

type Row = { label: string; value: string; mono?: boolean; wide?: boolean; link?: boolean };

// One list per section. `wide` rows take the full width of the pane.
const sections = computed<Row[][]>(() => {
  const job = props.job;
  if (!job) return [];
  return [
    [
      { label: "jobs.task", value: job.task, mono: true, wide: true },
      { label: "jobs.attempts", value: jobAttempts(job) },
      { label: "jobs.createdBy", value: job.user?.name || t("jobs.system") },
    ],
    [
      { label: "jobs.scheduledFor", value: date(job.runAt) },
      { label: "jobs.schedule", value: job.cron ?? dash, mono: !!job.cron },
      { label: "jobs.created", value: date(job.createdAt) },
      { label: "jobs.updated", value: date(job.updatedAt) },
    ],
    [
      { label: "jobs.target", value: job.target ?? dash, wide: true, link: !!props.target },
      { label: "jobs.document", value: job.docId || dash, mono: !!job.docId },
      { label: "jobs.locale", value: job.locale ? localeLabel(job.locale) : dash },
    ],
  ];
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="gap-0">
      <template v-if="job">
        <SheetHeader class="border-border border-b">
          <SheetDescription class="truncate font-mono">{{ job.id }}</SheetDescription>
          <SheetTitle class="flex items-center gap-2">
            <span class="truncate font-mono">{{ job.task }}</span>
            <JobStatus :status="job.status" />
          </SheetTitle>
        </SheetHeader>

        <div class="grid gap-5 overflow-auto p-4 text-sm">
          <template v-for="(rows, i) in sections" :key="i">
            <Separator v-if="i" />
            <dl class="grid grid-cols-2 gap-x-4 gap-y-4">
              <div v-for="row in rows" :key="row.label" :class="row.wide && 'col-span-2'">
                <dt class="text-muted-foreground mb-1">{{ t(row.label) }}</dt>
                <dd :class="[row.mono && 'font-mono text-xs', 'break-all']">
                  <RouterLink
                    v-if="row.link && target"
                    :to="target.to"
                    class="underline-offset-2 hover:underline"
                  >
                    {{ target.label }}
                  </RouterLink>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </div>
            </dl>
          </template>

          <Separator />
          <JobCode :title="t('jobs.payload')" :value="json(job.payload)" />
          <JobCode :title="t('jobs.result')" :value="json(job.result)" />
          <JobCode v-if="job.error" :title="t('jobs.lastError')" :value="job.error" />
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
