<script setup lang="ts">
import type { FieldContext } from "integral-cms/admin";

const props = defineProps<FieldContext>();

const set = (n: number) => props.onChange(props.value === String(n) ? null : String(n));
</script>

<template>
  <span>
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      :aria-label="`${n} of 5`"
      :disabled="field.readOnly"
      style="font-size: 1.25rem"
      @click="set(n)"
    >
      {{ n <= Number(value ?? 0) ? "★" : "☆" }}
    </button>
  </span>
</template>
