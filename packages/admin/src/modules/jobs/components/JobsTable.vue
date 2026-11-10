<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Job } from "../../../../../core/src/jobs/types";
import { schema } from "@/shared/api";
import { text } from "@/shared/i18n";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { localeLabel } from "@/shared/locale";
import { ago, formatDateTime } from "@/shared/utils";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { jobActions, jobAttempts, jobTargetLink, type JobAction } from "../jobs";
import JobDetails from "./JobDetails.vue";
import JobStatus from "./JobStatus.vue";

// `busy`: the id of the job an action runs for.
defineProps<{ jobs: Job[]; busy?: string }>();
const emit = defineEmits<{ action: [action: JobAction, job: Job] }>();
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();

const actions = {
  run: { label: "jobs.runNow", icon: "play" },
  retry: { label: "jobs.retry", icon: "rotate-ccw" },
  cancel: { label: "jobs.cancel", icon: "x" },
} as const;

const viewing = ref<Job>();
const detailsOpen = computed({
  get: () => !!viewing.value,
  set: (open) => !open && (viewing.value = undefined),
});

function targetLabel(job: Job) {
  const link = jobTargetLink(job, schema.value);
  if (!link) return undefined;
  const entry =
    link.kind === "global"
      ? schema.value.globals?.[link.name]
      : schema.value.collections?.[link.name];
  return { ...link, label: text(entry?.label) ?? link.name };
}
</script>

<template>
  <div class="border-border bg-card overflow-hidden rounded-lg border">
    <Table>
      <TableHeader class="bg-muted/40">
        <TableRow class="hover:bg-transparent">
          <TableHead>{{ t("jobs.task") }}</TableHead>
          <TableHead>{{ t("jobs.target") }}</TableHead>
          <TableHead>{{ t("jobs.scheduledFor") }}</TableHead>
          <TableHead>{{ t("jobs.status") }}</TableHead>
          <TableHead>{{ t("jobs.attempts") }}</TableHead>
          <TableHead>{{ t("jobs.createdBy") }}</TableHead>
          <TableHead>{{ t("jobs.lastError") }}</TableHead>
          <TableHead class="text-right">
            <span class="sr-only">{{ t("jobs.actions") }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="!jobs.length" :colspan="8" class="text-muted-foreground py-10">
          <div class="flex flex-col items-center gap-2">
            <Icon name="inbox" class="text-xl" />
            {{ t("common.nothingYet") }}
          </div>
        </TableEmpty>
        <TableRow v-for="job in jobs" :key="job.id" class="group/row last:border-0">
          <TableCell class="font-mono text-xs">{{ job.task }}</TableCell>
          <TableCell>
            <template v-if="targetLabel(job)">
              <RouterLink
                :to="targetLabel(job)!.to"
                class="font-medium underline-offset-2 hover:underline"
              >
                {{ targetLabel(job)!.label }}
              </RouterLink>
              <span v-if="job.docId" class="text-muted-foreground ml-1 font-mono text-xs">
                {{ job.docId.slice(0, 8) }}
              </span>
              <span
                v-if="job.locale"
                class="bg-muted text-muted-foreground ml-1.5 rounded px-1.5 py-0.5 text-xs"
              >
                {{ localeLabel(job.locale) }}
              </span>
            </template>
            <span v-else class="text-muted-foreground">{{ job.target ?? "–" }}</span>
          </TableCell>
          <TableCell class="whitespace-nowrap">
            <div>{{ formatDateTime(job.runAt, locale, timeZone) }}</div>
            <div class="text-muted-foreground text-xs">{{ ago(job.runAt, locale) }}</div>
          </TableCell>
          <TableCell><JobStatus :status="job.status" /></TableCell>
          <TableCell class="tabular-nums">{{ jobAttempts(job) }}</TableCell>
          <TableCell>
            <span :class="!job.user && 'text-muted-foreground'">{{
              job.user?.name || t("jobs.system")
            }}</span>
          </TableCell>
          <TableCell class="text-destructive max-w-64 truncate" :title="job.error ?? undefined">
            {{ job.error ?? "" }}
          </TableCell>
          <TableCell class="text-right whitespace-nowrap">
            <!-- A mouse reveals the actions on hover or focus. Touch screens always show them. -->
            <div
              class="inline-flex items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-hover/row:opacity-100"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :title="t('jobs.details')"
                @click="viewing = job"
              >
                <Icon name="eye" />
                <span class="max-md:sr-only">{{ t("jobs.details") }}</span>
              </Button>
              <Button
                v-for="action in jobActions(job)"
                :key="action"
                type="button"
                variant="ghost"
                size="sm"
                :class="action === 'cancel' && 'hover:text-destructive'"
                :title="t(actions[action].label)"
                :disabled="busy === job.id"
                @click="emit('action', action, job)"
              >
                <Icon :name="actions[action].icon" />
                <span class="max-md:sr-only">{{ t(actions[action].label) }}</span>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>

  <JobDetails v-model:open="detailsOpen" :job="viewing" :target="viewing && targetLabel(viewing)" />
</template>
