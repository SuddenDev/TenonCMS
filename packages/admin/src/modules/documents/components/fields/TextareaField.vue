<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Textarea } from "@/shared/components/ui/textarea";

const props = defineProps<FieldProps<"textarea">>();
const model = defineModel<any>();
// `field-sizing: content` ignores the `rows` attribute, so the lines become a minimum height plus padding and border.
const minHeight = `calc(${props.field.rows ?? 8}lh + 1rem + 2px)`;
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <Textarea
      :id="id"
      v-model="model"
      :style="{ minHeight }"
      v-bind="attrs"
      :aria-invalid="invalid"
    />
  </FieldFrame>
</template>
