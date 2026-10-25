<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Row } from "../status";

// `compact`: only the dot, with the state as its accessible name.
defineProps<{ status: Row["status"]; compact?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <span
    :data-status="status"
    class="data-[status=deactivated]:text-muted-foreground data-[status=expired]:text-destructive inline-flex items-center gap-1.5 text-sm before:size-2 before:rounded-full before:bg-current data-[status=active]:text-emerald-600 data-[status=invited]:text-amber-600"
  >
    <span :class="compact ? 'sr-only' : 'text-foreground'">{{ t(`users.states.${status}`) }}</span>
  </span>
</template>
