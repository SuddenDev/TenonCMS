<script lang="ts">
import type { SeparatorProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

export interface PaneMenuSeparatorProps extends SeparatorProps {
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import { useForwardExpose, useForwardProps } from "reka-ui";
import { Separator } from "@/shared/components/ui/separator";
import { cn } from "@/shared/utils";

const props = defineProps<PaneMenuSeparatorProps>();
const forwarded = useForwardProps(reactiveOmit(props, "class"));
const { forwardRef } = useForwardExpose();
</script>

<template>
  <Separator
    :ref="forwardRef"
    v-bind="forwarded"
    data-slot="pane-menu-separator"
    :class="cn('my-1', props.class)"
  />
</template>
