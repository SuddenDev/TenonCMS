<script setup lang="ts">
import type { NumberFieldIncrementProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { NumberFieldIncrement, useForwardProps } from "reka-ui";
import { cn } from "@/shared/utils";

const props = defineProps<NumberFieldIncrementProps & { class?: HTMLAttributes["class"] }>();
const forwarded = useForwardProps(reactiveOmit(props, "class"));
</script>

<template>
  <NumberFieldIncrement
    v-bind="forwarded"
    :class="
      cn(
        'text-muted-foreground/80 hover:text-foreground flex cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </NumberFieldIncrement>
</template>
