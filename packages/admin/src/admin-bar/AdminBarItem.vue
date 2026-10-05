<script setup lang="ts">
import { ToolbarButton, ToolbarLink } from "reka-ui";
import type { AdminBarContext, AdminBarItem } from "../../../core/src/admin/index.d.ts";
// Deep per-icon import, an exception to the lazy `Icon.vue` rule: the bar MUST NOT load Icon.vue's chunk with every icon for its own glyphs.
import ChevronDown from "@lucide/vue/dist/esm/icons/chevron-down.mjs";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Switch } from "@/shared/components/ui/switch";
import { kind } from "./kind";
import MountItem from "./MountItem.vue";
import PerspectiveMenu from "./PerspectiveMenu.vue";

withDefaults(defineProps<{ item: AdminBarItem; ctx: AdminBarContext; align?: "start" | "end" }>(), {
  align: "start",
});
</script>

<template>
  <PerspectiveMenu v-if="kind(item, ctx.mode) === 'perspective'" :ctx :align />

  <label
    v-else-if="kind(item, ctx.mode) === 'edit'"
    class="flex items-center gap-1.5 px-2 text-xs font-medium"
  >
    {{ item.label }}
    <ToolbarButton as-child>
      <Switch class="scale-75" :model-value="ctx.edit" @update:model-value="ctx.setEdit($event)" />
    </ToolbarButton>
  </label>

  <MountItem v-else-if="kind(item, ctx.mode) === 'mount'" :mount="item.mount!" :ctx />

  <DropdownMenu v-else-if="kind(item, ctx.mode) === 'menu'">
    <DropdownMenuTrigger as-child>
      <ToolbarButton as-child>
        <Button variant="ghost" size="xs">
          <Icon v-if="item.icon" :name="item.icon" />
          {{ item.label }}
          <ChevronDown class="text-muted-foreground" />
        </Button>
      </ToolbarButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align :side="ctx.position === 'top' ? 'bottom' : 'top'" class="w-auto">
      <template v-for="child in item.children" :key="child.id">
        <DropdownMenuItem v-if="child.href" as-child class="py-1 text-xs">
          <a :href="child.href">
            <Icon v-if="child.icon" :name="child.icon" />
            {{ child.label }}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem v-else class="py-1 text-xs" @select="child.onClick?.()">
          <Icon v-if="child.icon" :name="child.icon" />
          {{ child.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>

  <ToolbarLink v-else-if="kind(item, ctx.mode) === 'link'" as-child>
    <Button as="a" :href="item.href" variant="ghost" size="xs">
      <Icon v-if="item.icon" :name="item.icon" />
      {{ item.label }}
    </Button>
  </ToolbarLink>

  <ToolbarButton v-else as-child>
    <Button variant="ghost" size="xs" @click="item.onClick?.()">
      <Icon v-if="item.icon" :name="item.icon" />
      {{ item.label }}
    </Button>
  </ToolbarButton>
</template>
