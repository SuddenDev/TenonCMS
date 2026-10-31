<script setup lang="ts">
import { computed, inject, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Field } from "@/shared/api";
import { blocksOf } from "../../../../../../core/src/schema/traversal/blocks-of";
import { focusKey } from "@/modules/documents/fields";
import { type Item, itemChain, type ListField, nestedLists } from "@/modules/documents/items";
import { useItemTree } from "@/modules/documents/composables/useItemTree";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { FieldError } from "@/shared/components/ui/field";
import BlockPicker from "./BlockPicker.vue";
import ItemOutline from "./ItemOutline.vue";
import ItemSheet from "./ItemSheet.vue";

// The main view of an `array` or `blocks` field with `appearance: "tree"`: the outline of every item at every depth, an
// edit sheet per item and one block picker for every list.
const props = defineProps<{
  name: string;
  field: Extract<Field, { type: "array" | "blocks" }>;
  root: Record<string, unknown>;
  isNew?: boolean;
  path?: string;
  errors?: Record<string, string>;
}>();
const model = defineModel<Item[]>({ required: true });
const { t } = useI18n();
const path = () => props.path ?? props.name;
const field = computed(() => props.field as ListField);
const singular = () =>
  text(props.field.labels?.singular) ??
  t(props.field.type === "blocks" ? "items.block" : "items.item");
const full = () => props.field.maxRows !== undefined && model.value.length >= props.field.maxRows;

const tree = useItemTree(() => ({
  name: props.name,
  path: path(),
  field: field.value,
  items: model.value,
}));
// A tree inside an item of another list shares its state, so each tree takes only its own picks.
const picking = computed({
  get: () => {
    const at = tree.picking.value?.path;
    return !!at && (at === path() || at.startsWith(`${path()}.`));
  },
  set: (value) => {
    if (!value) tree.picking.value = null;
  },
});
const pickerBlocks = computed(() => {
  const list = tree.picking.value?.field;
  return list?.type === "blocks" ? blocksOf(list) : {};
});

// Every item that holds a non-empty list, at any depth.
function parents(items: Item[], listField: ListField, at: string): Item[] {
  return items.flatMap((item, i) => {
    const lists = nestedLists(listField, item, `${at}.${i}`).filter((l) => l.items.length);
    return lists.length ? [item, ...lists.flatMap((l) => parents(l.items, l.field, l.path))] : [];
  });
}
const expandAll = () =>
  parents(model.value, field.value, path()).forEach((i) => tree.open.add(i.id));
const collapseAll = () =>
  parents(model.value, field.value, path()).forEach((i) => tree.open.delete(i.id));

// Opens the rows above `target`, the dot path of an item or a field inside one.
function reveal(target: string) {
  const chain = itemChain(field.value, model.value, path(), target);
  for (const { item } of chain.slice(0, -1)) tree.open.add(item.id);
  return chain.at(-1);
}

// A failed save opens the rows down to the first error.
watch(
  () => props.errors,
  (errors) => {
    const first = Object.keys(errors ?? {}).find((key) => key.startsWith(`${path()}.`));
    if (first) reveal(first);
  },
  { immediate: true },
);

// The site's `edit()` on a field inside an item opens the item's sheet. The field focuses itself once it mounts.
const focus = inject(focusKey, undefined);
watch(
  () => focus?.value,
  (target) => {
    if (!target?.startsWith(`${path()}.`)) return;
    const item = reveal(target);
    if (item) tree.editing.value = item.path;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="model.length" class="-mt-1 flex justify-end gap-1">
      <Button type="button" variant="ghost" size="xs" @click="expandAll">
        <Icon name="chevrons-up-down" />{{ t("items.expandAll") }}
      </Button>
      <Button type="button" variant="ghost" size="xs" @click="collapseAll">
        <Icon name="chevrons-down-up" />{{ t("items.collapseAll") }}
      </Button>
    </div>
    <div class="border-border rounded-md border p-1">
      <ItemOutline tree :field="field" :items="model" :path="path()" :errors="errors" />
    </div>
    <Button
      type="button"
      variant="outline"
      size="lg"
      class="w-full"
      :disabled="!!field.readOnly || full()"
      @click="tree.add(path(), field)"
    >
      <Icon name="plus" />{{ t("items.add", { label: singular() }) }}
    </Button>
    <FieldError v-if="errors?.[path()]">{{ errors[path()] }}</FieldError>
    <BlockPicker
      v-model:open="picking"
      :blocks="pickerBlocks"
      :label="singular()"
      @pick="tree.pick"
    />
    <ItemSheet
      :name="name"
      :field="field"
      :items="model"
      :path="path()"
      :root="root"
      :is-new="isNew"
      :errors="errors"
    />
  </div>
</template>
