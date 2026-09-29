<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/utils";
import { Separator } from "@/shared/components/ui/separator";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <Separator
    data-slot="sidebar-separator"
    data-sidebar="separator"
    :class="cn('bg-sidebar-border data-[orientation=horizontal]:w-auto', props.class)"
  >
    <slot />
  </Separator>
</template>
