<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { JobStatus } from "../../../../../core/src/jobs/types";
import Icon from "@/shared/components/Icon.vue";

defineProps<{ status: JobStatus }>();
const { t } = useI18n();

const styles: Record<JobStatus, { icon: string; class: string }> = {
  queued: { icon: "clock", class: "bg-scheduled/10 text-scheduled" },
  running: { icon: "loader-circle", class: "bg-warning/10 text-warning [&_svg]:animate-spin" },
  done: { icon: "circle-check", class: "bg-success/10 text-success" },
  failed: { icon: "circle-x", class: "bg-destructive/10 text-destructive" },
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="styles[status].class"
  >
    <Icon :name="styles[status].icon" />
    {{ t(`jobs.statuses.${status}`) }}
  </span>
</template>
