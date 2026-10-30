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

// One list of the outline, with the lists of its items below each item.
const props = defineProps<{ field: ListField; items: Item[]; path: string }>();
const tree = injectItemTree();
const { itemName, listName } = useItemNames();
const drop = useListDrop(
  tree,
  () => props.path,
  () => props.field,
  () => props.items.length,
);
const itemPath = (i: number) => `${props.path}.${i}`;
</script>

<template>
  <ul class="flex flex-col" @dragover="drop.overList" @drop.prevent.stop="tree.drop()">
    <template v-for="(item, i) in items" :key="item.id">
      <li v-if="drop.at.value === i" class="py-0.5" @dragover.prevent.stop>
        <div class="border-ring bg-accent h-7 rounded-sm border-2 border-dashed" />
      </li>
      <li
        class="data-[dragging=true]:opacity-50"
        :data-dragging="tree.dragged.value?.path === itemPath(i)"
        @dragover="drop.overRow($event, i)"
      >
        <div class="hover:bg-muted flex h-8 items-center gap-1.5 rounded-sm pr-2 text-sm">
          <span
            class="text-muted-foreground flex size-6 shrink-0 cursor-grab items-center justify-center"
            :draggable="!field.readOnly"
            aria-hidden="true"
            @dragstart="tree.start($event, { path: itemPath(i), item, field })"
            @dragend="tree.end()"
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
          v-for="list in nestedLists(field, item, itemPath(i))"
          :key="list.path"
          class="border-border ml-3 border-l pl-3"
        >
          <p class="text-muted-foreground py-1 text-xs">{{ listName(list.field, list.key) }}</p>
          <ItemOutline :field="list.field" :items="list.items" :path="list.path" />
        </div>
      </li>
    </template>
    <li v-if="drop.at.value === items.length" class="py-0.5" @dragover.prevent.stop>
      <div class="border-ring bg-accent h-7 rounded-sm border-2 border-dashed" />
    </li>
    <li v-else-if="!items.length" class="text-muted-foreground py-1 text-xs italic">—</li>
  </ul>
</template>
