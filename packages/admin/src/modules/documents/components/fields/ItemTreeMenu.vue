<script setup lang="ts">
import { computed, inject } from "vue";
import { structureKey } from "@/modules/documents/fields";
import { useI18n } from "vue-i18n";
import { type Item, type ListField, nestedLists, treeRow } from "@/modules/documents/items";
import {
  injectItemTree,
  type MoveTarget,
  useItemNames,
} from "@/modules/documents/composables/useItemTree";
import { injectLinks } from "@/modules/documents/composables/useLinks";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

// The menu of a tree row. "Move to" is the keyboard path for drag and drop.
const props = defineProps<{
  item: Item;
  field: ListField;
  path: string;
  label: string;
  full: boolean;
}>();
const { t } = useI18n();
const tree = injectItemTree();
const links = injectLinks();
const { listName, treeItemName } = useItemNames();

const lists = computed(() => nestedLists(props.field, props.item, props.path));
const isFull = (list: { field: ListField; items: Item[] }) =>
  list.field.maxRows !== undefined && list.items.length >= list.field.maxRows;
// Computed only once the "Move to" menu renders.
const targets = computed(() =>
  tree.targets({ path: props.path, item: props.item, field: props.field }),
);
// Like a row, a target's owner is named by its title or its link's title, like "About › Children".
const targetName = (target: MoveTarget) => {
  const list = listName(target.field, target.key);
  if (!target.owner) return list;
  const { item, field, index } = target.owner;
  return `${treeRow(item, field, links.resolve).title || treeItemName(field, item, index)} › ${list}`;
};
const addChild = (list: { path: string; field: ListField }) =>
  tree.add(list.path, list.field, props.item);
const structure = inject(structureKey, undefined);
function remove() {
  if (structure?.value.synced && !confirm(t("structure.removeEverywhere"))) return;
  tree.remove(props.path);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('items.actions', { name: label })"
        :disabled="field.readOnly"
      >
        <Icon name="ellipsis" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-if="lists.length === 1"
        :disabled="isFull(lists[0]!) || lists[0]!.field.readOnly"
        @select="addChild(lists[0]!)"
      >
        <Icon name="plus" />{{ t("items.addChild") }}
      </DropdownMenuItem>
      <DropdownMenuSub v-else-if="lists.length > 1">
        <DropdownMenuSubTrigger
          ><Icon name="plus" />{{ t("items.addChild") }}</DropdownMenuSubTrigger
        >
        <DropdownMenuSubContent>
          <DropdownMenuItem
            v-for="list in lists"
            :key="list.path"
            :disabled="isFull(list) || list.field.readOnly"
            @select="addChild(list)"
          >
            {{ listName(list.field, list.key) }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem :disabled="full" @select="tree.duplicate(path, item, field)">
        <Icon name="copy" />{{ t("items.duplicate") }}
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Icon name="corner-down-right" />{{ t("items.moveTo") }}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="max-h-80 overflow-y-auto">
          <DropdownMenuItem
            v-for="target in targets"
            :key="target.path"
            :style="{ paddingLeft: `${0.5 + target.depth * 0.75}rem` }"
            @select="tree.moveTo(path, target.path, target.index)"
          >
            <span class="truncate">{{ targetName(target) }}</span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="!targets.length" disabled>
            {{ t("items.noTargets") }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @select="remove">
        <Icon name="trash" />{{ t("common.delete") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
