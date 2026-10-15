<script setup lang="ts">
import type { AdminBarItemContext } from "integral-cms/admin";
import { computed } from "vue";
import { texts } from "../utils/texts.ts";

const props = defineProps<AdminBarItemContext<number>>();
const t = computed(() => texts(props.integral.locale));
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
    {{ t("count", { n: data }) }}
  </span>
</template>
