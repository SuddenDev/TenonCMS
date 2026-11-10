<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { can } from "@/shared/access";
import { active, isEmpty } from "@/modules/documents/fields";
import { SEO_LENGTHS } from "@/modules/documents/seo/seo-checks";
import { useSeo } from "@/modules/documents/seo/useSeo";
import Icon from "@/shared/components/Icon.vue";
import type { FieldProps } from "./types";
import FieldInput from "../FieldInput.vue";
import FieldLayout from "./FieldLayout.vue";
import SeoLengthHint from "./SeoLengthHint.vue";
import SeoPreview from "./SeoPreview.vue";
import SharedMarker from "./SharedMarker.vue";
import { FieldSet, FieldLegend, FieldDescription, FieldError } from "@/shared/components/ui/field";
import { Separator } from "@/shared/components/ui/separator";

const props = defineProps<FieldProps<"group">>();
const model = defineModel<any>();
const { t } = useI18n();
const path = computed(() => props.path ?? props.name);
const message = computed(() => props.errors?.[path.value]);
const required = computed(() => props.field.required && !props.loose);
const seo =
  props.field.editor === "seo"
    ? useSeo(
        () => props.root,
        () => model.value,
        () => props.field.templates,
      )
    : undefined;
const editable = (child: FieldProps["field"]) =>
  !props.field.readOnly &&
  !("readOnly" in child && child.readOnly) &&
  can(child, props.isNew ? "create" : "update");
const hinted = (key: string): key is keyof typeof SEO_LENGTHS => !!seo && key in SEO_LENGTHS;
// An empty SEO title or description shows the site default, unless the default language has a value.
const placeholders = computed(() => {
  const inherited = props.placeholders?.[props.name] as Record<string, unknown> | undefined;
  if (!seo) return inherited;
  const { title, description } = seo.defaults.value;
  return {
    ...inherited,
    title: inherited?.title || title,
    description: inherited?.description || description,
  };
});
</script>

<template>
  <FieldSet
    :disabled="field.readOnly"
    :class="[
      'gap-6',
      field.appearance !== 'plain' && 'border-border rounded-lg border px-4 pt-4 pb-5',
    ]"
  >
    <!-- A plain group keeps its heading for screen readers. -->
    <FieldLegend
      variant="label"
      :class="field.appearance === 'plain' ? 'sr-only' : 'mb-0 w-auto px-2'"
    >
      {{ text(field.label) ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </FieldLegend>
    <FieldDescription v-if="description" class="-mt-1">{{ text(description) }}</FieldDescription>
    <p v-if="seo" class="flex items-center gap-2 text-sm font-medium">
      <Icon :name="seo.passing.value === 3 ? 'circle-check' : 'circle-alert'" class="size-4" />
      {{ t("seo.checks", { n: seo.passing.value, max: 3 }) }}
    </p>
    <Separator v-if="seo" />
    <SeoPreview
      v-if="seo"
      :url="seo.url.value"
      :title="seo.meta.value.title"
      :description="seo.meta.value.description"
    />
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
          :placeholders="placeholders"
          :suffix="seo && key === 'title' ? seo.suffix.value : undefined"
        />
        <SeoLengthHint
          v-if="seo && hinted(key)"
          :text="seo.meta.value[key] ?? ''"
          :limits="SEO_LENGTHS[key]"
          :disabled="!editable(child)"
          @generate="model[key] = seo.generated.value[key] ?? ''"
        />
      </template>
    </FieldLayout>
    <FieldError v-if="message">{{ message }}</FieldError>
  </FieldSet>
</template>
