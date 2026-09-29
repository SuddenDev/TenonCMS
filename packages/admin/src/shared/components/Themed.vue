<script setup lang="ts">
import { computed } from "vue";
import type { Themed } from "../../../../core/src/admin/index.d.ts";

defineOptions({ inheritAttrs: false });
const props = defineProps<{ src: Themed; alt?: string }>();

const one = computed(() => (typeof props.src === "string" ? props.src : undefined));
</script>

<template>
  <img v-if="one" :src="one" :alt="alt ?? ''" v-bind="$attrs" />
  <template v-else-if="typeof src !== 'string'">
    <!-- The admin's own theme decides, not the OS: it sets the `dark` class on <html>. -->
    <img :src="src.light" :alt="alt ?? ''" class="dark:hidden" v-bind="$attrs" />
    <img :src="src.dark" :alt="alt ?? ''" class="hidden dark:block" v-bind="$attrs" />
  </template>
</template>
