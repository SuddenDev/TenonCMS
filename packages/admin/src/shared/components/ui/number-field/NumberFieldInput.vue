<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { NumberFieldInput } from "reka-ui";
import { cn } from "@/shared/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <NumberFieldInput
    data-slot="input"
    :class="
      cn(
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 placeholder:text-muted-foreground h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base tabular-nums transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
        props.class,
      )
    "
  />
</template>
