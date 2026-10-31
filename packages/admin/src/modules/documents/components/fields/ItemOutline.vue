<script setup lang="ts">
import {
  blockOf,
  itemTitle,
  type Item,
  type ListField,
  nestedLists,
} from "@/modules/documents/items";
import {
  injectItemTree,
  useItemNames,
  useListDrop,
} from "@/modules/documents/composables/useItemTree";
import Icon from "@/shared/components/Icon.vue";
import ItemTreeRow from "./ItemTreeRow.vue";

// One list of the outline, with the lists of its items below each item.
// `tree`: the main view of an `appearance: "tree"` field. Rows collapse, open their edit sheet and have a menu. Empty
// lists show only while an item is dragged, as drop targets.
const props = defineProps<{
  field: ListField;
  items: Item[];
  path: string;
  tree?: boolean;
  errors?: Record<string, string>;
}>();
const outline = injectItemTree();
const { itemName, listName } = useItemNames();
const drop = useListDrop(
  outline,
  () => props.path,
  () => props.field,
  () => props.items.length,
);
const itemPath = (i: number) => `${props.path}.${i}`;
const full = () => props.field.maxRows !== undefined && props.items.length >= props.field.maxRows;

const lists = (item: Item, i: number) => nestedLists(props.field, item, itemPath(i));
const hasChildren = (item: Item, i: number) => lists(item, i).some((l) => l.items.length);
const shownLists = (item: Item, i: number) =>
  !props.tree
    ? lists(item, i)
    : outline.open.has(item.id) || !hasChildren(item, i)
      ? lists(item, i).filter((l) => l.items.length || outline.dragged.value)
      : [];
</script>

<template>
  <ul class="flex flex-col" @dragover="drop.overList" @drop.prevent.stop="outline.drop()">
    <template v-for="(item, i) in items" :key="item.id">
      <li v-if="drop.at.value === i" class="py-0.5" @dragover.prevent.stop>
        <div
          class="border-ring bg-accent rounded-sm border-2 border-dashed"
          :class="tree ? 'h-9' : 'h-7'"
        />
      </li>
      <li
        class="data-[dragging=true]:opacity-50"
        :data-dragging="outline.dragged.value?.path === itemPath(i)"
        @dragover="drop.overRow($event, i)"
      >
        <ItemTreeRow
          v-if="tree"
          :item="item"
          :field="field"
          :path="itemPath(i)"
          :index="i"
          :has-children="hasChildren(item, i)"
          :full="full()"
          :errors="errors"
        />
        <div v-else class="hover:bg-muted flex h-8 items-center gap-1.5 rounded-sm pr-2 text-sm">
          <span
            class="text-muted-foreground flex size-6 shrink-0 cursor-grab items-center justify-center"
            :draggable="!field.readOnly"
            aria-hidden="true"
            @dragstart="outline.start($event, { path: itemPath(i), item, field })"
            @dragend="outline.end()"
          >
            <Icon name="grip-vertical" />
          </span>
          <Icon v-if="blockOf(field, item)?.icon" :name="blockOf(field, item)!.icon!" />
          <span class="truncate">{{ itemTitle(item, field) || itemName(field, item, i) }}</span>
          <span v-if="itemTitle(item, field)" class="text-muted-foreground truncate text-xs">
            {{ itemName(field, item, i) }}
          </span>
        </div>
        <div
          v-for="list in shownLists(item, i)"
          :key="list.path"
          class="border-border border-l"
          :class="tree ? 'ml-3 pl-2' : 'ml-3 pl-3'"
        >
          <p v-if="!tree || lists(item, i).length > 1" class="text-muted-foreground py-1 text-xs">
            {{ listName(list.field, list.key) }}
          </p>
          <ItemOutline
            :field="list.field"
            :items="list.items"
            :path="list.path"
            :tree="tree"
            :errors="errors"
          />
        </div>
      </li>
    </template>
    <li v-if="drop.at.value === items.length" class="py-0.5" @dragover.prevent.stop>
      <div
        class="border-ring bg-accent rounded-sm border-2 border-dashed"
        :class="tree ? 'h-9' : 'h-7'"
      />
    </li>
    <li v-else-if="!items.length" class="text-muted-foreground py-1 text-xs italic">—</li>
  </ul>
</template>
