<script setup lang="ts">
import {
  type Component,
  type ComponentPublicInstance,
  computed,
  defineAsyncComponent,
  inject,
  useTemplateRef,
  watch,
} from "vue";
import { focusKey } from "@/modules/documents/fields";
import type { FieldProps } from "./fields/types";
import TextField from "./fields/TextField.vue";
import TextareaField from "./fields/TextareaField.vue";
import NumberField from "./fields/NumberField.vue";
import DateField from "./fields/DateField.vue";
import SlugField from "./fields/SlugField.vue";
import SelectField from "./fields/SelectField.vue";
import RelationField from "./fields/RelationField.vue";
import BooleanField from "./fields/BooleanField.vue";
import GroupField from "./fields/GroupField.vue";
import ArrayField from "./fields/ArrayField.vue";
import BlocksField from "./fields/BlocksField.vue";
import ImageField from "./fields/ImageField.vue";
import FileField from "./fields/FileField.vue";
import CustomField from "./fields/CustomField.vue";

const props = defineProps<FieldProps>();
const model = defineModel<any>();
const path = computed(() => props.path ?? props.name);
const fields: Record<string, Component> = {
  text: TextField,
  textarea: TextareaField,
  richtext: defineAsyncComponent(() => import("./fields/RichtextField.vue")),
  number: NumberField,
  date: DateField,
  datetime: DateField,
  slug: SlugField,
  select: SelectField,
  relation: RelationField,
  boolean: BooleanField,
  group: GroupField,
  array: ArrayField,
  blocks: BlocksField,
  image: ImageField,
  file: FileField,
};
const renderer = computed(() => fields[props.field.type] ?? CustomField);

// Runs after render, so the field's element exists when it mounts with a matching path.
const box = useTemplateRef<ComponentPublicInstance>("box");
const focus = inject(focusKey, undefined);
watch(
  () => focus?.value,
  (target) => {
    const el = box.value?.$el as HTMLElement | undefined;
    if (!focus || target !== path.value || !el) return;

    focus.value = null;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>("input, textarea, [contenteditable=true], select, button")?.focus(
      {
        preventScroll: true,
      },
    );
  },
  { immediate: true, flush: "post" },
);
</script>

<template>
  <component
    :is="renderer"
    v-if="field.type !== 'join'"
    ref="box"
    v-bind="props"
    v-model="model"
    :path="path"
  />
</template>
