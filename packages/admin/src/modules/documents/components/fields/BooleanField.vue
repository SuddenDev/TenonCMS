<script setup lang="ts">
import { computed, useId } from "vue";
import { text } from "@/shared/i18n";
import type { FieldProps } from "./types";
import SharedMarker from "./SharedMarker.vue";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Switch } from "@/shared/components/ui/switch";
import {
  Field as FieldBox,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/shared/components/ui/field";

const props = defineProps<FieldProps<"boolean">>();
const model = defineModel<any>();
const id = useId();
const message = computed(() => props.errors?.[props.path ?? props.name]);
const invalid = computed(() => (message.value ? true : undefined));
</script>

<template>
  <FieldBox orientation="horizontal" :data-invalid="invalid">
    <component
      :is="field.appearance === 'switch' ? Switch : Checkbox"
      :id="id"
      v-model="model"
      :disabled="field.readOnly"
      :aria-invalid="invalid"
    />
    <FieldContent>
      <FieldLabel :for="id"
        >{{ text(field.label) ?? name }}<SharedMarker v-if="shared"
      /></FieldLabel>
      <FieldDescription v-if="description">{{ text(description) }}</FieldDescription>
      <FieldError v-if="message">{{ message }}</FieldError>
    </FieldContent>
  </FieldBox>
</template>
