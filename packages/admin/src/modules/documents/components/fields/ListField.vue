<script setup lang="ts">
import { computed } from "vue";
import { text } from "@/shared/i18n";
import type { FieldProps } from "./types";
import ItemList from "./ItemList.vue";
import SharedMarker from "./SharedMarker.vue";
import { FieldSet, FieldLegend, FieldDescription } from "@/shared/components/ui/field";

const props = defineProps<FieldProps<"array" | "blocks">>();
const model = defineModel<any>();
const path = computed(() => props.path ?? props.name);
const required = computed(() => props.field.required && !props.loose);
</script>

<template>
  <FieldSet :disabled="field.readOnly" class="gap-3">
    <FieldLegend variant="label" class="mb-3">
      {{ text(field.labels?.plural) ?? text(field.label) ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </FieldLegend>
    <FieldDescription v-if="field.description" class="-mt-1">{{
      text(field.description)
    }}</FieldDescription>
    <ItemList
      v-model="model"
      :name="name"
      :field="field"
      :root="root"
      :is-new="isNew"
      :path="path"
      :errors="errors"
    />
  </FieldSet>
</template>
