<script setup lang="ts">
import { text } from "@/shared/i18n";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import ChoiceInput from "./ChoiceInput.vue";

const props = defineProps<FieldProps<"select">>();
const model = defineModel<any>();
const options = props.field.options.map((o) =>
  typeof o === "string"
    ? { value: o, label: o }
    : { value: o.value, label: text(o.label) ?? o.value },
);
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, required, invalid }">
    <ChoiceInput
      :id="id"
      v-model="model"
      :options="options"
      :many="field.many"
      :appearance="field.appearance"
      :required="required"
      :disabled="field.readOnly"
      :invalid="invalid"
    />
  </FieldFrame>
</template>
