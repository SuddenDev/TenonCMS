<script setup lang="ts">
import type { FieldProps } from "./types";
import ListField from "./ListField.vue";

const props = defineProps<FieldProps<"array">>();
const model = defineModel<any>();
</script>

<template>
  <ListField v-bind="props" v-model="model" />
</template>
