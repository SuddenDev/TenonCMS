<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { schema } from "@/shared/api";
import {
  blockOf,
  hasErrorsAt,
  type Item,
  type ListField,
  treeRow,
} from "@/modules/documents/items";
import { injectItemTree, useItemNames } from "@/modules/documents/composables/useItemTree";
import { injectLinks } from "@/modules/documents/composables/useLinks";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import ItemTreeMenu from "./ItemTreeMenu.vue";

// One row of a tree field: drag handle, chevron, title with its link, error marker and menu. A click opens the sheet.
const props = defineProps<{
  item: Item;
  field: ListField;
  path: string;
  index: number;
  hasChildren: boolean;
  full: boolean;
  errors?: Record<string, string>;
}>();
const { t } = useI18n();
const tree = injectItemTree();
const links = injectLinks();
const { treeItemName, itemName } = useItemNames();
const row = computed(() => treeRow(props.item, props.field, links.resolve));
const title = computed(() => row.value.title || treeItemName(props.field, props.item, props.index));
const expanded = computed(() => tree.open.has(props.item.id));
const collection = computed(() => {
  const name = row.value.collection;
  return name && (text(schema.value.collections?.[name]?.label) ?? name);
});

function toggle() {
  if (expanded.value) tree.open.delete(props.item.id);
  else tree.open.add(props.item.id);
}
</script>

<template>
  <div class="hover:bg-muted flex min-h-11 items-center gap-0.5 rounded-sm pr-1 text-sm">
    <span
      class="text-muted-foreground flex size-6 shrink-0 cursor-grab items-center justify-center"
      :draggable="!field.readOnly"
      aria-hidden="true"
      @dragstart="tree.start($event, { path, item, field })"
      @dragend="tree.end()"
    >
      <Icon name="grip-vertical" />
    </span>
    <Button
      v-if="hasChildren"
      type="button"
      variant="ghost"
      size="icon-xs"
      :aria-expanded="expanded"
      :aria-label="t(expanded ? 'items.collapse' : 'items.expand', { name: title })"
      @click="toggle"
    >
      <Icon
        name="chevron-right"
        class="text-muted-foreground transition-transform"
        :class="expanded && 'rotate-90'"
      />
    </Button>
    <span v-else class="size-6 shrink-0" />
    <Button
      type="button"
      variant="ghost"
      class="h-auto min-w-0 flex-1 justify-start gap-2 px-1.5 py-1 text-left font-normal hover:bg-transparent"
      @click="tree.editing.value = path"
    >
      <Icon v-if="blockOf(field, item)?.icon" :name="blockOf(field, item)!.icon!" />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate" :class="(!row.title || row.fromLink) && 'text-muted-foreground'">
          {{ title }}
        </span>
        <span class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span class="truncate">{{ row.line ?? itemName(field, item, index) }}</span>
          <span v-if="collection" class="bg-muted shrink-0 rounded-sm px-1">{{ collection }}</span>
        </span>
      </span>
    </Button>
    <span
      v-if="hasErrorsAt(errors, path)"
      class="bg-destructive size-1.5 shrink-0 rounded-full"
      role="img"
      :aria-label="t('documents.hasErrors')"
    />
    <ItemTreeMenu :item="item" :field="field" :path="path" :label="title" :full="full" />
  </div>
</template>
