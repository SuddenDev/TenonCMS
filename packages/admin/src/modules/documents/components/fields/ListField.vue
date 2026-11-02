<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { structureKey } from "@/modules/documents/fields";
import { text } from "@/shared/i18n";
import type { FieldProps } from "./types";
import ItemList from "./ItemList.vue";
import ItemTree from "./ItemTree.vue";
import SharedMarker from "./SharedMarker.vue";
import { FieldSet, FieldLegend, FieldDescription } from "@/shared/components/ui/field";

const props = defineProps<FieldProps<"array" | "blocks">>();
const model = defineModel<any>();
const { t } = useI18n();
const path = computed(() => props.path ?? props.name);
const required = computed(() => props.field.required && !props.loose);
const structure = inject(structureKey, undefined);
// Lists inside items follow their item, so only the outer lists show the hint.
const sharedStructure = computed(
  () => !!structure?.value.synced && !path.value.split(".").some((s) => /^\d+$/.test(s)),
);
</script>

<template>
  <FieldSet :disabled="field.readOnly" class="gap-3">
    <FieldLegend variant="label" class="mb-3">
      {{ text(field.labels?.plural) ?? text(field.label) ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
      <SharedMarker v-else-if="sharedStructure" :label="t('structure.shared')" />
    </FieldLegend>
    <FieldDescription v-if="field.description" class="-mt-1">{{
      text(field.description)
    }}</FieldDescription>
    <component
      :is="field.appearance === 'tree' ? ItemTree : ItemList"
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
