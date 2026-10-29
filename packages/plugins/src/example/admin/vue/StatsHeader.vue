<script setup lang="ts">
import type { PageContext } from "tenoncms/admin";
import { computed } from "vue";
import type { Stats } from "../../types.ts";
import { texts } from "../utils/texts.ts";

const props = defineProps<PageContext<Stats>>();
const t = computed(() => texts(props.tenon.locale));
</script>

<template>
  <div class="header">
    {{ t("title") }}&nbsp;&bullet;&nbsp;<a :href="`${tenon.base}/content/collections/quotes`">{{
      t("count", { n: data.count })
    }}</a>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
a {
  text-decoration: underline;
}
</style>
