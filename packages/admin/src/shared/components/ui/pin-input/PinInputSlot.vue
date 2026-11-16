<script setup lang="ts">
import type { PinInputInputProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { cn } from "@/shared/utils";
import { PinInputInput, useForwardProps } from "reka-ui";

const props = defineProps<PinInputInputProps & { class?: HTMLAttributes["class"] }>();

const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <PinInputInput
    data-slot="pin-input-slot"
    v-bind="forwarded"
    :class="
      cn(
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 size-11 rounded-lg border bg-transparent text-center text-lg transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed aria-invalid:ring-3',
        props.class,
      )
    "
  />
</template>
