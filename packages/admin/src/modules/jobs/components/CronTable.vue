<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { CronEntry } from "../../../../../core/src/jobs/types";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { formatDateTime } from "@/shared/utils";
import JobStatus from "./JobStatus.vue";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";

defineProps<{ entries: CronEntry[] }>();
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();
</script>

<template>
  <div class="border-border bg-card overflow-hidden rounded-lg border">
    <Table>
      <TableHeader class="bg-muted/40">
        <TableRow class="hover:bg-transparent">
          <TableHead>{{ t("jobs.schedule") }}</TableHead>
          <TableHead>{{ t("jobs.task") }}</TableHead>
          <TableHead>{{ t("jobs.next") }}</TableHead>
          <TableHead>{{ t("jobs.last") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="!entries.length" :colspan="4" class="text-muted-foreground">
          {{ t("common.nothingYet") }}
        </TableEmpty>
        <TableRow
          class="last:border-0"
          v-for="entry in entries"
          :key="`${entry.pattern} ${entry.task}`"
        >
          <TableCell class="font-mono text-xs">{{ entry.pattern }}</TableCell>
          <TableCell class="font-mono text-xs">{{ entry.task }}</TableCell>
          <TableCell class="whitespace-nowrap">
            {{ entry.next ? formatDateTime(entry.next, locale, timeZone) : t("jobs.never") }}
          </TableCell>
          <TableCell class="whitespace-nowrap">
            <template v-if="entry.last">
              {{ formatDateTime(entry.last.runAt, locale, timeZone) }}
              <JobStatus
                class="ml-1.5"
                :status="entry.last.status"
                :title="entry.last.error ?? undefined"
              />
            </template>
            <span v-else class="text-muted-foreground">{{ t("jobs.never") }}</span>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
