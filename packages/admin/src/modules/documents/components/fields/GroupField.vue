<script setup lang="ts">
import { computed } from "vue";
import { text } from "@/shared/i18n";
import { active, isEmpty } from "@/modules/documents/fields";
import type { FieldProps } from "./types";
import FieldInput from "../FieldInput.vue";
import FieldLayout from "./FieldLayout.vue";
import SharedMarker from "./SharedMarker.vue";
import { FieldSet, FieldLegend, FieldDescription, FieldError } from "@/shared/components/ui/field";

const props = defineProps<FieldProps<"group">>();
const model = defineModel<any>();
const path = computed(() => props.path ?? props.name);
const message = computed(() => props.errors?.[path.value]);
const required = computed(() => props.field.required && !props.loose);
</script>

<template>
  <FieldSet
    :disabled="field.readOnly"
    class="border-border min-w-0 gap-6 rounded-lg border px-4 pt-4 pb-5"
  >
    <FieldLegend variant="label" class="mb-0 w-auto px-2">
      {{ text(field.label) ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </FieldLegend>
    <FieldDescription v-if="description" class="-mt-1">{{ text(description) }}</FieldDescription>
    <FieldLayout
      :fields="field.fields"
      :layout="field"
      :show="(_, f) => active(f, root, model)"
      :path="path"
      :errors="errors"
    >
      <template #field="{ name: key, field: child }">
        <FieldInput
          v-model="model[key]"
          :name="key"
          :field="child"
          :root="root"
          :siblings="{ fields: field.fields, data: model }"
          :is-new="isNew"
          :loose="loose || (!field.required && isEmpty(model))"
          :path="`${path}.${key}`"
          :errors="errors"
          :placeholders="placeholders?.[name] as Record<string, unknown> | undefined"
        />
      </template>
    </FieldLayout>
    <FieldError v-if="message">{{ message }}</FieldError>
  </FieldSet>
</template>
