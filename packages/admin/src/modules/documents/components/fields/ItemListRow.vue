<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Field } from "@/shared/api";
import { itemFields } from "../../../../../../core/src/schema/traversal/item-fields";
import { active } from "@/modules/documents/fields";
import { blockOf, itemTitle, type Item, nestedLists } from "@/modules/documents/items";
import { injectItemTree, useItemNames } from "@/modules/documents/composables/useItemTree";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import FieldInput from "../FieldInput.vue";
import FieldLayout from "./FieldLayout.vue";
import ItemOutlineDialog from "./ItemOutlineDialog.vue";

const props = defineProps<{
  item: Item;
  field: Extract<Field, { type: "array" | "blocks" }>;
  root: Record<string, unknown>;
  label: string;
  path: string;
  open: boolean;
  first: boolean;
  last: boolean;
  full: boolean;
  isNew?: boolean;
  errors?: Record<string, string>;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  dragStart: [event: DragEvent];
  dragEnd: [];
  move: [offset: number];
  duplicate: [];
  remove: [];
}>();
const { t } = useI18n();
const fields = computed(() => itemFields(props.field, props.item));
const block = computed(() => blockOf(props.field, props.item));
const title = computed(() => itemTitle(props.item, props.field));
const tree = injectItemTree();
const { targetName } = useItemNames();
const nested = computed(() => nestedLists(props.field, props.item, props.path).length > 0);
const outline = ref(false);

// Computed only once the "Move to" menu renders.
const targets = computed(() =>
  tree.targets({ path: props.path, item: props.item, field: props.field }),
);
</script>

<template>
  <Collapsible :open="open" @update:open="emit('update:open', $event)">
    <div class="flex items-center gap-1 p-2">
      <span
        class="text-muted-foreground flex size-8 shrink-0 cursor-grab items-center justify-center"
        :draggable="!field.readOnly"
        aria-hidden="true"
        @dragstart="emit('dragStart', $event)"
        @dragend="emit('dragEnd')"
      >
        <Icon name="grip-vertical" />
      </span>
      <CollapsibleTrigger
        class="group/trigger hover:bg-muted dark:hover:bg-muted/50 flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-sm font-medium"
      >
        <Icon
          name="chevron-right"
          class="text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90"
        />
        <Icon v-if="block?.icon" :name="block!.icon!" />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate">{{ title || label }}</span>
          <span v-if="title" class="text-muted-foreground truncate text-xs">{{ label }}</span>
        </span>
      </CollapsibleTrigger>
      <Button
        v-if="nested"
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('items.outline', { name: label })"
        :title="t('items.outline', { name: label })"
        @click="outline = true"
      >
        <Icon name="list-tree" />
      </Button>
      <ItemOutlineDialog
        v-if="nested"
        v-model:open="outline"
        :item="item"
        :field="field"
        :path="path"
        :label="title || label"
      />
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
          <DropdownMenuItem :disabled="first" @select="emit('move', -1)">
            <Icon name="arrow-up" />{{ t("common.moveUp") }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="last" @select="emit('move', 1)">
            <Icon name="arrow-down" />{{ t("common.moveDown") }}
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
          <DropdownMenuItem :disabled="full" @select="emit('duplicate')">
            <Icon name="copy" />{{ t("items.duplicate") }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="tree.open.clear()">
            <Icon name="chevrons-down-up" />{{ t("items.collapseAll") }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="emit('remove')">
            <Icon name="trash" />{{ t("common.remove") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <CollapsibleContent class="border-border border-t px-5 py-6">
      <p v-if="!fields" class="text-muted-foreground text-sm">
        {{ t("items.unknownBlock", { type: item.blockType }) }}
      </p>
      <FieldLayout
        v-else
        :fields="fields!"
        :layout="field.type === 'blocks' ? block : field"
        :show="(_, f) => active(f, root, item)"
        :path="path"
        :errors="errors"
      >
        <template #field="{ name: key, field: child }">
          <FieldInput
            v-model="item[key]"
            :name="key"
            :field="child"
            :root="root"
            :siblings="{ fields: fields!, data: item }"
            :is-new="isNew"
            :path="`${path}.${key}`"
            :errors="errors"
          />
        </template>
      </FieldLayout>
    </CollapsibleContent>
  </Collapsible>
</template>
