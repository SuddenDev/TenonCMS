<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Input } from "@/shared/components/ui/input";

const props = defineProps<FieldProps<"text">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <Input :id="id" v-model="model" v-bind="attrs" :aria-invalid="invalid" />
  </FieldFrame>
</template>
