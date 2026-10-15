<script setup lang="ts">
import type { PageContext } from "integral-cms/admin";
import { computed } from "vue";
import type { Stats } from "../../types.ts";
import { texts } from "../utils/texts.ts";

const props = defineProps<PageContext<Stats>>();
const t = computed(() => texts(props.integral.locale));
</script>

<template>
  <div class="header">
    {{ t("title") }}&nbsp;&bullet;&nbsp;<a :href="`${integral.base}/content/collections/quotes`">{{
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
