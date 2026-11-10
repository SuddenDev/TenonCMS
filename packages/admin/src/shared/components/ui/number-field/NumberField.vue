<script setup lang="ts">
import type { NumberFieldRootEmits, NumberFieldRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { NumberFieldRoot, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/shared/utils";

const props = defineProps<NumberFieldRootProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<NumberFieldRootEmits>();
const forwarded = useForwardPropsEmits(reactiveOmit(props, "class"), emits);
</script>

<template>
  <NumberFieldRoot v-slot="slotProps" v-bind="forwarded" :class="cn('relative', props.class)">
    <slot v-bind="slotProps" />
  </NumberFieldRoot>
</template>
