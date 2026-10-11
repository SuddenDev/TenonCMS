<script setup lang="ts">
import type { PageContext } from "integral-cms/admin";
import type { Stats } from "../../types.ts";

defineProps<PageContext<Stats>>();
</script>

<template>
  <div class="header">
    Quote stats&nbsp;&bullet;&nbsp;<a :href="`${integral.base}/content/collections/quotes`"
      >{{ data.count }} quotes</a
    >
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
