<script setup lang="ts">
import type { NumberFieldDecrementProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { NumberFieldDecrement, useForwardProps } from "reka-ui";
import { cn } from "@/shared/utils";

const props = defineProps<NumberFieldDecrementProps & { class?: HTMLAttributes["class"] }>();
const forwarded = useForwardProps(reactiveOmit(props, "class"));
</script>

<template>
  <NumberFieldDecrement
    v-bind="forwarded"
    :class="
      cn(
        'text-muted-foreground/80 hover:text-foreground flex cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </NumberFieldDecrement>
</template>
