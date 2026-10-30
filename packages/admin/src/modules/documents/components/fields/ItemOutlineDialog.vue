<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { type Item, type ListField, nestedLists } from "@/modules/documents/items";
import { useItemNames } from "@/modules/documents/composables/useItemTree";
import { injectPaneElement } from "@/shared/components/pane/context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import ItemOutline from "./ItemOutline.vue";

// The tree of the lists inside one item. Items move by drag and drop, also across depths.
defineProps<{ item: Item; field: ListField; path: string; label: string }>();
const open = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const { listName } = useItemNames();
const pane = injectPaneElement(null);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :container="pane ?? undefined"
      class="max-h-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>{{ t("items.outline", { name: label }) }}</DialogTitle>
      </DialogHeader>
      <div class="-mx-1 overflow-y-auto px-1">
        <div v-for="list in nestedLists(field, item, path)" :key="list.path">
          <p class="text-muted-foreground py-1 text-xs">{{ listName(list.field, list.key) }}</p>
          <ItemOutline :field="list.field" :items="list.items" :path="list.path" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
