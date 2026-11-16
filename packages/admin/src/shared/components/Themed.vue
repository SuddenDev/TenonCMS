<script setup lang="ts">
import type { Themed } from "../../../../core/src/admin/index.d.ts";
import icon from "./logo/tenon-icon.svg?raw";
import logo from "./logo/tenon-logo-full.svg?raw";

defineOptions({ inheritAttrs: false });
/** `full` picks the full logo over the icon as the default image, when `src` is unset. */
defineProps<{ src?: Themed; alt?: string; full?: boolean }>();
</script>

<template>
  <img v-if="typeof src === 'string'" :src="src" :alt="alt ?? ''" v-bind="$attrs" />
  <template v-else-if="src">
    <!-- The admin's own theme decides, not the OS: it sets the `dark` class on <html>. -->
    <img :src="src.light" :alt="alt ?? ''" class="dark:hidden" v-bind="$attrs" />
    <img :src="src.dark" :alt="alt ?? ''" class="hidden dark:block" v-bind="$attrs" />
  </template>
  <!-- The default image is inline SVG with `currentColor`, so it follows the theme through `text-foreground`. -->
  <span
    v-else
    role="img"
    :aria-label="alt ?? 'tenoncms'"
    class="text-foreground inline-block [&>svg]:size-full"
    :class="full && 'aspect-[2282/360]'"
    v-bind="$attrs"
    v-html="full ? logo : icon"
  ></span>
</template>
