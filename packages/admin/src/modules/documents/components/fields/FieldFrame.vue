<script setup lang="ts">
import { computed, useAttrs, useId } from "vue";
import type { FieldProps } from "./types";
import { text } from "@/shared/i18n";
import SharedMarker from "./SharedMarker.vue";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/shared/components/ui/field";

defineOptions({ inheritAttrs: false });
const props = defineProps<FieldProps & { unlabeled?: boolean }>();
const inheritedAttrs = useAttrs();
const forwarded = () =>
  Object.fromEntries(
    Object.entries(inheritedAttrs).filter(
      ([key]) => key !== "modelValue" && key !== "modelModifiers",
    ),
  );
const id = useId();
const message = computed(() => props.errors?.[props.path ?? props.name]);
const invalid = computed(() => (message.value ? true : undefined));
const required = computed(() => props.field.required && !props.loose);
// Built-in checks and `readOnly` as HTML attributes. Vue drops `undefined` ones, and browsers ignore those an input does not support.
const attrs = computed(() => {
  const f = props.field as Record<string, any>;
  const inherited = props.placeholders?.[props.name];
  return {
    required: required.value,
    disabled: f.readOnly,
    placeholder:
      typeof inherited === "string" || typeof inherited === "number"
        ? String(inherited)
        : f.placeholder,
    minlength: f.minLength,
    maxlength: f.maxLength,
    pattern: f.pattern,
    min: f.min,
    max: f.max,
    step: f.step,
  };
});
</script>

<template>
  <Field v-bind="forwarded()" :data-invalid="invalid">
    <component :is="unlabeled ? FieldTitle : FieldLabel" :for="unlabeled ? undefined : id">
      <span v-if="text(field.label)">{{ text(field.label) }}</span>
      <span v-else class="capitalize">{{ name }}</span>
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </component>
    <FieldDescription v-if="field.description" class="-mt-1">{{
      text(field.description)
    }}</FieldDescription>
    <slot :id="id" :attrs="attrs" :required="required" :invalid="invalid" />
    <FieldError v-if="message">{{ message }}</FieldError>
  </Field>
</template>
