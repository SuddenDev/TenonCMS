<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { keyStatus } from "../api-keys";

// `compact`: only the dot, with the state as its accessible name.
defineProps<{ status: ReturnType<typeof keyStatus>; compact?: boolean }>();
const { t } = useI18n();
</script>

<template>
  <span
    :data-status="status"
    class="data-[status=revoked]:text-muted-foreground inline-flex items-center gap-1.5 text-sm before:size-2 before:rounded-full before:bg-current data-[status=active]:text-emerald-500 data-[status=expired]:text-amber-600"
  >
    <span :class="compact ? 'sr-only' : 'text-foreground'">{{
      t(`apiKeys.states.${status}`)
    }}</span>
  </span>
</template>
