<script lang="ts">
export interface PaneMenuSkeletonProps {
  rows?: number;
}
</script>
<script setup lang="ts">
import { ref } from "vue";
import { Skeleton } from "../ui/skeleton";
import { injectPaneMenuContext } from "./context";

withDefaults(defineProps<PaneMenuSkeletonProps>(), { rows: 3 });
const menu = injectPaneMenuContext({ layout: ref("normal") });
const heights = { compact: "h-8", normal: "h-12", detailed: "h-14" } as const;
</script>

<template>
  <div
    v-for="i in rows"
    :key="i"
    data-slot="pane-menu-skeleton"
    :class="['flex items-center gap-2 px-2', heights[menu.layout.value]]"
  >
    <Skeleton class="size-8 shrink-0 rounded-xs" />
    <Skeleton class="h-8 flex-1 rounded-xs" />
  </div>
</template>
