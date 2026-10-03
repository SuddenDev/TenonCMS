<script lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import type { PaneLayout } from "./context";

export interface PaneMenuProps extends PrimitiveProps {
  layout?: PaneLayout;
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import { Primitive, useForwardExpose, useForwardProps } from "reka-ui";
import { toRef } from "vue";
import { cn } from "@/shared/utils";
import { providePaneMenuContext } from "./context";

const props = withDefaults(defineProps<PaneMenuProps>(), { as: "nav", layout: "normal" });
const forwarded = useForwardProps(reactiveOmit(props, "class", "layout"));
const { forwardRef } = useForwardExpose();

providePaneMenuContext({ layout: toRef(() => props.layout) });
</script>

<template>
  <Primitive
    :ref="forwardRef"
    v-bind="forwarded"
    data-slot="pane-menu"
    :data-layout="layout"
    :class="cn('flex flex-col gap-1.5 px-2 py-3', props.class)"
  >
    <slot />
  </Primitive>
</template>
