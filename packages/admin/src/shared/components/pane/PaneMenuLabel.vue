<script lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

export interface PaneMenuLabelProps extends PrimitiveProps {
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import { Primitive, useForwardExpose, useForwardProps } from "reka-ui";
import { cn } from "@/shared/utils";

const props = withDefaults(defineProps<PaneMenuLabelProps>(), { as: "h2" });
const forwarded = useForwardProps(reactiveOmit(props, "class"));
const { forwardRef } = useForwardExpose();
</script>

<template>
  <Primitive
    :ref="forwardRef"
    v-bind="forwarded"
    data-slot="pane-menu-label"
    :class="cn('text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium first:pt-2', props.class)"
  >
    <slot />
  </Primitive>
</template>
