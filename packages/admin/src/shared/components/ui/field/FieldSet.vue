<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <!-- `min-w-0`: a fieldset is at least as wide as its content by default, so a long row title would widen the form. -->
  <fieldset
    data-slot="field-set"
    :class="
      cn(
        'flex min-w-0 flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        props.class,
      )
    "
  >
    <slot />
  </fieldset>
</template>
