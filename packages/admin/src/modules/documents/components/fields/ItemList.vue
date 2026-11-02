<script setup lang="ts">
import { inject, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Field } from "@/shared/api";
import { blocksOf } from "../../../../../../core/src/schema/traversal/blocks-of";
import { focusKey, structureKey } from "@/modules/documents/fields";
import { duplicateItem, type Item, moveItem, newItem } from "@/modules/documents/items";
import {
  useItemNames,
  useItemTree,
  useListDrop,
} from "@/modules/documents/composables/useItemTree";
import { FieldError } from "@/shared/components/ui/field";
import ItemListRow from "./ItemListRow.vue";
import ItemListAdd from "./ItemListAdd.vue";

// `field`: an `array`, or `blocks` where each item picks its fields by its `blockType`.
// `path`: dot path of the list, the prefix of its items' paths in `errors` and `focusKey`. Defaults to `name`.
// `root`: the whole form data, for conditions of item fields.
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
const { itemName } = useItemNames();
const path = () => props.path ?? props.name;
const blocks = () => (props.field.type === "blocks" ? blocksOf(props.field) : undefined);
const singular = () =>
  text(props.field.itemLabels?.singular) ?? t(blocks() ? "items.block" : "items.item");
const full = () => props.field.maxRows !== undefined && model.value.length >= props.field.maxRows;

// Rows added in this session open, saved ones start collapsed.
const tree = useItemTree(() => ({
  name: props.name,
  path: path(),
  field: props.field,
  items: model.value,
}));
const { open } = tree;
const drop = useListDrop(
  tree,
  path,
  () => props.field,
  () => model.value.length,
);
const isDragged = (i: number) => tree.dragged.value?.path === `${path()}.${i}`;

// A row with an error opens, so the message is visible.
watch(
  () => props.errors,
  (errors) => {
    model.value.forEach((item, i) => {
      if (Object.keys(errors ?? {}).some((key) => key.startsWith(`${path()}.${i}.`)))
        open.add(item.id);
    });
  },
  { immediate: true },
);

// A row opens for a field in it that is to be focused. The field focuses itself once it mounts.
const focus = inject(focusKey, undefined);
watch(
  () => focus?.value,
  (target) => {
    if (!target?.startsWith(`${path()}.`)) return;
    const item = model.value[Number(target.slice(path().length + 1).split(".")[0])];
    if (item) open.add(item.id);
  },
  { immediate: true },
);

function toggle(id: string, value: boolean) {
  if (value) open.add(id);
  else open.delete(id);
}
function add(blockType?: string) {
  const item = newItem(props.field, blockType);
  model.value = [...model.value, item];
  open.add(item.id);
}
function move(from: number, to: number) {
  model.value = moveItem(model.value, from, to);
}
function duplicate(i: number) {
  const copy = duplicateItem(model.value[i], props.field);
  model.value = [...model.value.slice(0, i + 1), copy, ...model.value.slice(i + 1)];
  open.add(copy.id);
}
const structure = inject(structureKey, undefined);
function remove(i: number) {
  if (structure?.value.synced && !confirm(t("structure.removeEverywhere"))) return;
  open.delete(model.value[i].id);
  model.value = model.value.filter((_, j) => j !== i);
}
</script>

<template>
  <div class="flex flex-col gap-3" @dragover="drop.overList" @drop.prevent.stop="tree.drop()">
    <ol
      v-if="model.length || drop.at.value !== null"
      class="border-border divide-border divide-y overflow-hidden rounded-md border"
    >
      <template v-for="(item, i) in model" :key="item.id">
        <li v-if="drop.at.value === i" class="p-1" @dragover.prevent.stop>
          <div class="border-ring bg-accent h-12 rounded-sm border-2 border-dashed" />
        </li>
        <li
          class="data-[dragging=true]:opacity-50"
          :data-dragging="isDragged(i)"
          @dragover="drop.overRow($event, i)"
        >
          <ItemListRow
            :item="item"
            :field="field"
            :root="root"
            :label="itemName(field, item, i)"
            :path="`${path()}.${i}`"
            :open="open.has(item.id)"
            :first="i === 0"
            :last="i === model.length - 1"
            :full="full()"
            :is-new="isNew"
            :errors="errors"
            @update:open="toggle(item.id, $event)"
            @drag-start="tree.start($event, { path: `${path()}.${i}`, item, field })"
            @drag-end="tree.end()"
            @move="move(i, i + $event)"
            @duplicate="duplicate(i)"
            @remove="remove(i)"
          />
        </li>
      </template>
      <li v-if="drop.at.value === model.length" class="p-1" @dragover.prevent.stop>
        <div class="border-ring bg-accent h-12 rounded-sm border-2 border-dashed" />
      </li>
    </ol>
    <ItemListAdd
      :blocks="blocks()"
      :label="singular()"
      :disabled="!!field.readOnly || full()"
      @add="add"
    />
    <FieldError v-if="errors?.[path()]">{{ errors[path()] }}</FieldError>
  </div>
</template>
