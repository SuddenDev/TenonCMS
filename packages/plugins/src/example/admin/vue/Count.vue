<script setup lang="ts">
import type { AdminBarItemContext } from "integral-cms/admin";

defineProps<AdminBarItemContext<number>>();
</script>

<!-- Styled inline, because the bar's shadow root gets no page CSS. -->
<template>
  <span
    style="
      font:
        500 11px/1 ui-monospace,
        monospace;
      padding: 3px 6px;
      border-radius: 4px;
      background: rgb(127 127 127 / 0.15);
    "
  >
    {{ data }} quotes
  </span>
</template>
