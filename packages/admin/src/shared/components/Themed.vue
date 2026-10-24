<script setup lang="ts">
import type { Themed } from "../../../../core/src/admin/index.d.ts";

defineOptions({ inheritAttrs: false });
defineProps<{ src?: Themed; alt?: string }>();
</script>

<template>
  <img v-if="typeof src === 'string'" :src="src" :alt="alt ?? ''" v-bind="$attrs" />
  <template v-else-if="src">
    <!-- The admin's own theme decides, not the OS: it sets the `dark` class on <html>. -->
    <img :src="src.light" :alt="alt ?? ''" class="dark:hidden" v-bind="$attrs" />
    <img :src="src.dark" :alt="alt ?? ''" class="hidden dark:block" v-bind="$attrs" />
  </template>
  <!-- The default mark follows the theme through its color tokens. -->
  <svg
    v-else
    viewBox="0 0 32 32"
    role="img"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : true"
    v-bind="$attrs"
  >
    <rect width="32" height="32" rx="8" class="fill-primary" />
    <path
      d="M20.5 8.2c-1.6-1.5-5-1.1-5 2.6v10.4c0 3.7-3.4 4.1-5 2.6"
      fill="none"
      stroke-width="2.75"
      stroke-linecap="round"
      class="stroke-primary-foreground"
    />
  </svg>
</template>
