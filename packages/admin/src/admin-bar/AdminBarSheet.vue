<script setup lang="ts">
import { ToolbarButton } from "reka-ui";
import { ref } from "vue";
import type { AdminBarContext, AdminBarItem } from "../../../core/src/admin/index.d.ts";
// Deep per-icon imports, an exception to the lazy `Icon.vue` rule: the bar MUST NOT load Icon.vue's chunk with every icon for its own glyphs.
import Menu from "@lucide/vue/dist/esm/icons/menu.mjs";
import X from "@lucide/vue/dist/esm/icons/x.mjs";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { kind } from "./kind";
import MountItem from "./MountItem.vue";
import PerspectiveMenu from "./PerspectiveMenu.vue";

defineProps<{ items: AdminBarItem[]; ctx: AdminBarContext }>();

const open = ref(false);
const run = (item: AdminBarItem) => {
  open.value = false;
  item.onClick?.();
};
</script>

<template>
  <Sheet v-model:open="open">
    <SheetTrigger as-child>
      <ToolbarButton as-child>
        <Button variant="ghost" size="icon-xs" aria-label="Open admin menu">
          <Menu />
        </Button>
      </ToolbarButton>
    </SheetTrigger>
    <SheetContent side="right" :show-close-button="false" class="gap-0">
      <SheetHeader class="flex-row items-center justify-between border-b p-2 pl-4">
        <SheetTitle>Admin</SheetTitle>
        <SheetClose as-child>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <X />
          </Button>
        </SheetClose>
      </SheetHeader>
      <ul class="flex flex-col gap-1 overflow-y-auto p-2">
        <li v-for="item in items" :key="item.id">
          <div
            v-if="kind(item, ctx.mode) === 'perspective'"
            class="flex h-8 items-center justify-between pl-2.5 text-sm font-medium"
          >
            Perspective
            <PerspectiveMenu :ctx />
          </div>
          <label
            v-else-if="kind(item, ctx.mode) === 'edit'"
            class="flex h-8 items-center justify-between px-2.5 font-medium"
          >
            {{ item.label }}
            <Switch :model-value="ctx.edit" @update:model-value="ctx.setEdit($event)" />
          </label>
          <div
            v-else-if="kind(item, ctx.mode) === 'mount'"
            class="flex h-8 items-center justify-between pl-2.5 text-sm font-medium"
          >
            {{ item.label }}
            <MountItem :mount="item.mount!" :ctx />
          </div>
          <template v-else-if="kind(item, ctx.mode) === 'menu'">
            <p class="text-muted-foreground flex h-8 items-center gap-1 px-2.5 text-xs font-medium">
              <Icon v-if="item.icon" :name="item.icon" />
              {{ item.label }}
            </p>
            <ul class="flex flex-col gap-1 pl-3">
              <li v-for="child in item.children" :key="child.id">
                <Button
                  v-if="child.href"
                  as="a"
                  :href="child.href"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                >
                  <Icon v-if="child.icon" :name="child.icon" />
                  {{ child.label }}
                </Button>
                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                  @click="run(child)"
                >
                  <Icon v-if="child.icon" :name="child.icon" />
                  {{ child.label }}
                </Button>
              </li>
            </ul>
          </template>
          <Button
            v-else-if="item.href"
            as="a"
            :href="item.href"
            variant="ghost"
            size="sm"
            class="w-full justify-start"
          >
            <Icon v-if="item.icon" :name="item.icon" />
            {{ item.label }}
          </Button>
          <Button v-else variant="ghost" size="sm" class="w-full justify-start" @click="run(item)">
            <Icon v-if="item.icon" :name="item.icon" />
            {{ item.label }}
          </Button>
        </li>
      </ul>
    </SheetContent>
  </Sheet>
</template>
