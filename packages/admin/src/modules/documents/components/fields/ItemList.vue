<script setup lang="ts">
import { inject, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Field } from "@/shared/api";
import { focusKey } from "@/modules/documents/fields";
import { duplicateItem, type Item, moveItem, newItem } from "@/modules/documents/items";
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
const path = () => props.path ?? props.name;
const blocks = () => (props.field.type === "blocks" ? props.field.blocks : undefined);
const singular = () =>
  text(props.field.labels?.singular) ?? t(blocks() ? "items.block" : "items.item");
// The block of a row. Undefined for an array and for an unknown block.
const blockOf = (item: Item) =>
  blocks() && Object.hasOwn(blocks()!, item.blockType) ? blocks()![item.blockType] : undefined;
// Row name for the header and the actions label.
const rowName = (item: Item, i: number) =>
  blocks()
    ? (text(blockOf(item)?.label) ?? String(item.blockType))
    : t("items.numbered", { label: singular(), n: i + 1 });
const full = () => props.field.maxRows !== undefined && model.value.length >= props.field.maxRows;

// Ids of the open rows. Rows added in this session open, saved ones start collapsed.
const open = reactive(new Set<string>());
function toggle(id: string, value: boolean) {
  if (value) open.add(id);
  else open.delete(id);
}

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
function remove(i: number) {
  open.delete(model.value[i].id);
  model.value = model.value.filter((_, j) => j !== i);
}

// Native drag and drop: the handle starts the drag, a row takes the drop.
const dragging = ref<number | null>(null);
const over = ref<number | null>(null);
function dragStart(e: DragEvent, i: number) {
  const row = (e.target as HTMLElement).closest("li");
  if (row) e.dataTransfer?.setDragImage(row, 0, 0);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  dragging.value = i;
}
function dragEnd() {
  dragging.value = over.value = null;
}
function drop(i: number) {
  if (dragging.value !== null) move(dragging.value, i);
  dragEnd();
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ol
      v-if="model.length"
      class="border-border divide-border divide-y overflow-hidden rounded-md border"
    >
      <li
        v-for="(item, i) in model"
        :key="item.id"
        class="data-[over=true]:ring-ring data-[dragging=true]:opacity-50 data-[over=true]:ring-2 data-[over=true]:ring-inset"
        :data-dragging="dragging === i"
        :data-over="over === i && dragging !== i"
        @dragover.prevent="dragging !== null && (over = i)"
        @drop.prevent="drop(i)"
      >
        <ItemListRow
          :item="item"
          :field="field"
          :root="root"
          :label="rowName(item, i)"
          :path="`${path()}.${i}`"
          :open="open.has(item.id)"
          :first="i === 0"
          :last="i === model.length - 1"
          :full="full()"
          :is-new="isNew"
          :errors="errors"
          @update:open="toggle(item.id, $event)"
          @drag-start="dragStart($event, i)"
          @drag-end="dragEnd"
          @move="move(i, i + $event)"
          @duplicate="duplicate(i)"
          @remove="remove(i)"
        />
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
