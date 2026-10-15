<script setup lang="ts">
import { inject, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import type { Field } from "@/shared/api";
import { itemFields } from "../../../../../core/src/schema/traversal/item-fields";
import { active, focusKey } from "@/modules/documents/fields";
import { duplicateItem, type Item, itemTitle, moveItem, newItem } from "@/modules/documents/items";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { FieldError } from "@/shared/components/ui/field";
import FieldInput from "./FieldInput.vue";

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
    <ol v-if="model.length" class="flex flex-col gap-2">
      <li
        v-for="(item, i) in model"
        :key="item.id"
        class="bg-card border-border data-[over=true]:ring-ring rounded-md border data-[dragging=true]:opacity-50 data-[over=true]:ring-2"
        :data-dragging="dragging === i"
        :data-over="over === i && dragging !== i"
        @dragover.prevent="dragging !== null && (over = i)"
        @drop.prevent="drop(i)"
      >
        <Collapsible :open="open.has(item.id)" @update:open="toggle(item.id, $event)">
          <div class="flex items-center gap-1 p-1">
            <span
              class="text-muted-foreground flex size-8 shrink-0 cursor-grab items-center justify-center"
              :draggable="!field.readOnly"
              aria-hidden="true"
              @dragstart="dragStart($event, i)"
              @dragend="dragEnd"
            >
              <Icon name="grip-vertical" />
            </span>
            <CollapsibleTrigger
              class="group/trigger hover:bg-accent flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm"
            >
              <Icon
                name="chevron-right"
                class="text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90"
              />
              <Icon v-if="blockOf(item)?.icon" :name="blockOf(item)!.icon!" />
              <span class="shrink-0 font-medium">{{ rowName(item, i) }}</span>
              <span class="text-muted-foreground truncate">{{ itemTitle(item, field) }}</span>
            </CollapsibleTrigger>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('items.actions', { name: rowName(item, i) })"
                  :disabled="field.readOnly"
                >
                  <Icon name="ellipsis" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem :disabled="i === 0" @select="move(i, i - 1)">
                  <Icon name="arrow-up" />{{ t("common.moveUp") }}
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="i === model.length - 1" @select="move(i, i + 1)">
                  <Icon name="arrow-down" />{{ t("common.moveDown") }}
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="full()" @select="duplicate(i)">
                  <Icon name="copy" />{{ t("items.duplicate") }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" @select="remove(i)">
                  <Icon name="trash" />{{ t("common.remove") }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <CollapsibleContent class="border-border border-t p-3">
            <p v-if="!itemFields(field, item)" class="text-muted-foreground text-sm">
              {{ t("items.unknownBlock", { type: item.blockType }) }}
            </p>
            <div v-else class="flex flex-col gap-4">
              <template v-for="(child, key) in itemFields(field, item)" :key="key">
                <FieldInput
                  v-if="active(child, root, item)"
                  v-model="item[key]"
                  :name="String(key)"
                  :field="child"
                  :root="root"
                  :siblings="{ fields: itemFields(field, item)!, data: item }"
                  :is-new="isNew"
                  :path="`${path()}.${i}.${key}`"
                  :errors="errors"
                />
              </template>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </li>
    </ol>
    <div>
      <DropdownMenu v-if="blocks()">
        <DropdownMenuTrigger as-child>
          <Button type="button" variant="outline" size="sm" :disabled="field.readOnly || full()">
            <Icon name="plus" />{{ t("items.add", { label: singular() }) }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            v-for="(block, key) in blocks()"
            :key="key"
            class="items-start"
            @select="add(String(key))"
          >
            <Icon v-if="block.icon" :name="block.icon" class="mt-0.5" />
            <span class="flex flex-col">
              <span>{{ text(block.label) ?? key }}</span>
              <span v-if="block.description" class="text-muted-foreground text-xs">{{
                text(block.description)
              }}</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        v-else
        type="button"
        variant="outline"
        size="sm"
        :disabled="field.readOnly || full()"
        @click="add()"
      >
        <Icon name="plus" />{{ t("items.add", { label: singular() }) }}
      </Button>
    </div>
    <FieldError v-if="errors?.[path()]">{{ errors[path()] }}</FieldError>
  </div>
</template>
