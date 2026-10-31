<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Fields } from "@/shared/api";
import { itemFields } from "../../../../../../core/src/schema/traversal/item-fields";
import { active } from "@/modules/documents/fields";
import { blockOf, itemChain, type Item, type ListField, treeRow } from "@/modules/documents/items";
import { injectItemTree, useItemNames } from "@/modules/documents/composables/useItemTree";
import { injectLinks } from "@/modules/documents/composables/useLinks";
import { injectPaneElement } from "@/shared/components/pane/context";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import FieldInput from "../FieldInput.vue";
import FieldLayout from "./FieldLayout.vue";

// The edit sheet of the tree item at `tree.editing`. It opens inside the document pane, so the preview stays visible.
// Edits apply to the form data at once. The item's own lists stay out: the tree shows them.
const props = defineProps<{
  name: string;
  field: ListField;
  items: Item[];
  path: string;
  root: Record<string, unknown>;
  isNew?: boolean;
  errors?: Record<string, string>;
}>();
const { t } = useI18n();
const tree = injectItemTree();
const links = injectLinks();
const pane = injectPaneElement(null);
const { listName, treeItemName, itemName } = useItemNames();

const chain = computed(() =>
  tree.editing.value ? itemChain(props.field, props.items, props.path, tree.editing.value) : [],
);
const current = computed(() => {
  const last = chain.value.at(-1);
  return last && last.path === tree.editing.value ? last : undefined;
});
const indexOf = (path: string) => Number(path.slice(path.lastIndexOf(".") + 1));
const rowTitle = (entry: { item: Item; field: ListField; path: string }) =>
  treeRow(entry.item, entry.field, links.resolve).title ||
  treeItemName(entry.field, entry.item, indexOf(entry.path));
const trail = computed(() => [listName(props.field, props.name), ...chain.value.map(rowTitle)]);

const fields = computed(() => {
  const c = current.value;
  const all = c ? itemFields(c.field, c.item) : undefined;
  if (!all) return undefined;
  return Object.fromEntries(
    Object.entries(all).filter(([, f]) => f.type !== "array" && f.type !== "blocks"),
  ) as Fields;
});
// The first text field shows the title of the item's first link, the title its row falls back to.
const placeholders = computed(() => {
  const c = current.value;
  const key = Object.keys(fields.value ?? {}).find((k) => fields.value![k].type === "text");
  const row = c && treeRow(c.item, c.field, links.resolve);
  return key && row?.fromLink ? { [key]: row.title } : {};
});
const open = computed({
  get: () => !!current.value,
  set: (value) => {
    if (!value) tree.editing.value = null;
  },
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      :container="pane ?? undefined"
      :show-close-button="false"
      class="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
    >
      <template v-if="current">
        <SheetHeader class="border-border border-b">
          <SheetDescription class="truncate">{{ trail.join(" › ") }}</SheetDescription>
          <SheetTitle>{{
            itemName(current.field, current.item, indexOf(current.path))
          }}</SheetTitle>
        </SheetHeader>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <p v-if="!fields" class="text-muted-foreground text-sm">
            {{ t("items.unknownBlock", { type: current.item.blockType }) }}
          </p>
          <FieldLayout
            v-else
            :fields="fields"
            :layout="
              current.field.type === 'blocks' ? blockOf(current.field, current.item) : current.field
            "
            :show="(_, f) => active(f, root, current!.item)"
            :path="current.path"
            :errors="errors"
          >
            <template #field="{ name: key, field: child }">
              <FieldInput
                v-model="current.item[key]"
                :name="key"
                :field="child"
                :root="root"
                :siblings="{ fields: fields!, data: current.item }"
                :is-new="isNew"
                :path="`${current.path}.${key}`"
                :errors="errors"
                :placeholders="placeholders"
              />
            </template>
          </FieldLayout>
        </div>
        <SheetFooter class="border-border border-t">
          <Button type="button" @click="open = false">{{ t("items.done") }}</Button>
        </SheetFooter>
      </template>
    </SheetContent>
  </Sheet>
</template>
