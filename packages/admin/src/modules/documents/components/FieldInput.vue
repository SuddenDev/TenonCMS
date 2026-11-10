<script setup lang="ts">
import { type Component, computed, defineAsyncComponent, inject, useTemplateRef, watch } from "vue";
import { useFieldDescription } from "@/modules/documents/useFieldDescription";
import { registryKey } from "@/shared/options";
import { useAdminLocale } from "@/shared/i18n";
import { focusKey } from "@/modules/documents/fields";
import { can } from "@/shared/access";
import type { FieldProps } from "./fields/types";
import TextField from "./fields/TextField.vue";
import TextareaField from "./fields/TextareaField.vue";
import NumberField from "./fields/NumberField.vue";
import DateField from "./fields/DateField.vue";
import SlugField from "./fields/SlugField.vue";
import SelectField from "./fields/SelectField.vue";
import RelationField from "./fields/RelationField.vue";
import LinkField from "./fields/LinkField.vue";
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
const { locale } = useAdminLocale();
const readable = computed(() => can(props.field, "read"));
const description = useFieldDescription(
  () => (readable.value ? props.field.description : undefined),
  () => ({
    value: model.value,
    data: props.root,
    siblings: props.siblings.data,
    path: path.value,
    locale: locale.value,
  }),
  inject(registryKey, {}),
);
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
  link: LinkField,
  boolean: BooleanField,
  group: GroupField,
  array: ArrayField,
  blocks: BlocksField,
  image: ImageField,
  file: FileField,
};
const renderer = computed(() => fields[props.field.type] ?? CustomField);
// A field the user MAY NOT read is hidden. One they MAY NOT write shows disabled, like `readOnly`.
const field = computed(() =>
  can(props.field, props.isNew ? "create" : "update")
    ? props.field
    : { ...props.field, readOnly: true },
);

// Watches the element too: a field that mounts with a matching path has no element yet when setup runs. The wrapper
// is the element, because an async field renders a placeholder comment until it loads.
const box = useTemplateRef<HTMLElement>("box");
const focus = inject(focusKey, undefined);
watch(
  () => [focus?.value, box.value] as const,
  ([target, el]) => {
    if (!focus || target !== path.value || !el) return;

    focus.value = null;
    revealField(el);
  },
  { flush: "post" },
);

// A row or box that just opened keeps its content `hidden` for a frame or two, and scrolling a hidden element does
// nothing. So the scroll waits until the field has a box, for at most `frames` frames.
function revealField(el: HTMLElement, frames = 10) {
  if (!el.getClientRects().length && frames > 0) {
    requestAnimationFrame(() => revealField(el, frames - 1));
    return;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.querySelector<HTMLElement>("input, textarea, [contenteditable=true], select, button")?.focus({
    preventScroll: true,
  });
}
</script>

<template>
  <div v-if="field.type !== 'join' && readable" ref="box">
    <component
      :is="renderer"
      v-bind="props"
      :field="field"
      :description="description.text"
      v-model="model"
      :path="path"
    />
  </div>
  <p v-if="description.error" role="alert" class="text-destructive text-sm">
    {{ description.error.message }}
  </p>
</template>
