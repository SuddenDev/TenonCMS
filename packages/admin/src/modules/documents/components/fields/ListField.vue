<script setup lang="ts">
import { computed, inject, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { structureKey } from "@/modules/documents/fields";
import { text } from "@/shared/i18n";
import type { FieldProps } from "./types";
import ItemList from "./ItemList.vue";
import ItemTree from "./ItemTree.vue";
import SharedMarker from "./SharedMarker.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { FieldSet, FieldLegend, FieldDescription } from "@/shared/components/ui/field";

const props = defineProps<FieldProps<"array" | "blocks">>();
const model = defineModel<any>();
const { t } = useI18n();
const path = computed(() => props.path ?? props.name);
const required = computed(() => props.field.required && !props.loose);
const structure = inject(structureKey, undefined);
const tree = useTemplateRef<InstanceType<typeof ItemTree>>("list");
// Lists inside items follow their item, so only the outer lists show the hint.
const sharedStructure = computed(
  () => !!structure?.value.synced && !path.value.split(".").some((s) => /^\d+$/.test(s)),
);
</script>

<template>
  <FieldSet :disabled="field.readOnly" class="gap-3">
    <FieldLegend variant="label" class="mb-3 flex w-full items-center gap-1">
      <span>
        {{ text(field.itemLabels?.plural) ?? text(field.label) ?? name }}
        <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
        <SharedMarker v-if="shared" />
        <SharedMarker v-else-if="sharedStructure" :label="t('structure.shared')" />
      </span>
      <template v-if="field.appearance === 'tree' && model?.length">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="-my-1 ml-auto"
          @click="tree?.expandAll()"
        >
          <Icon name="chevrons-up-down" />{{ t("items.expandAll") }}
        </Button>
        <Button type="button" variant="ghost" size="xs" class="-my-1" @click="tree?.collapseAll()">
          <Icon name="chevrons-down-up" />{{ t("items.collapseAll") }}
        </Button>
      </template>
    </FieldLegend>
    <FieldDescription v-if="description" class="-mt-1">{{ text(description) }}</FieldDescription>
    <component
      :is="field.appearance === 'tree' ? ItemTree : ItemList"
      ref="list"
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
