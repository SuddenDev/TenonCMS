<script setup lang="ts">
import type { FieldContext } from "tenoncms/admin";
import { computed } from "vue";
import { texts } from "../utils/texts.ts";

const props = defineProps<FieldContext>();
const t = computed(() => texts(props.tenon.locale));

const set = (n: number) => props.onChange(props.value === String(n) ? null : String(n));
</script>

<template>
  <span>
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      :aria-label="t('star', { n })"
      :disabled="field.readOnly"
      style="font-size: 1.25rem"
      @click="set(n)"
    >
      {{ n <= Number(value ?? 0) ? "★" : "☆" }}
    </button>
  </span>
</template>
