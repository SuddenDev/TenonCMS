<script setup lang="ts">
import { ToolbarButton, ToolbarLink } from "reka-ui";
import type { AdminBarContext, AdminBarItem } from "../../../core/src/admin/index.d.ts";
// Deep per-icon import, an exception to the lazy `Icon.vue` rule: the bar MUST NOT load Icon.vue's chunk with every icon for its own glyphs.
import Box from "@lucide/vue/dist/esm/icons/box.mjs";
import ChevronDown from "@lucide/vue/dist/esm/icons/chevron-down.mjs";
import Themed from "@/shared/components/Themed.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Switch } from "@/shared/components/ui/switch";
import { childKind, isBuiltIn, kind, type BarItem } from "./kind";
import MountItem from "./MountItem.vue";
import PerspectiveMenu from "./PerspectiveMenu.vue";

defineProps<{ item: BarItem; ctx: AdminBarContext }>();
</script>

<template>
  <PerspectiveMenu v-if="kind(item) === 'perspective'" :ctx />

  <label
    v-else-if="kind(item) === 'edit'"
    class="flex shrink-0 items-center gap-1.5 px-2 text-xs font-medium"
  >
    {{ item.label }}
    <ToolbarButton as-child>
      <Switch
        :aria-label="item.label"
        class="scale-75"
        :model-value="ctx.edit"
        @update:model-value="ctx.setEdit($event)"
      />
    </ToolbarButton>
  </label>

  <MountItem v-else-if="kind(item) === 'mount'" :mount="item.mount!" :ctx />

  <DropdownMenu v-else-if="kind(item) === 'menu'">
    <DropdownMenuTrigger as-child>
      <ToolbarButton as-child>
        <Button variant="ghost" size="xs">
          <Icon v-if="item.icon" :name="item.icon" />
          {{ item.label }}
          <ChevronDown class="text-muted-foreground" />
        </Button>
      </ToolbarButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="start"
      :side="ctx.position.startsWith('top-') ? 'bottom' : 'top'"
      class="z-1000 w-auto"
      :side-offset="12"
    >
      <template v-for="child in item.children" :key="child.id">
        <MountItem v-if="childKind(child) === 'mount'" :mount="child.mount!" :ctx />
        <DropdownMenuItem v-else-if="childKind(child) === 'link'" as-child class="py-1 text-xs">
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

  <ToolbarLink v-else-if="kind(item) === 'link'" as-child>
    <Button
      as="a"
      :href="item.href"
      :aria-label="isBuiltIn(item, 'dashboard') ? (ctx.name ?? 'integral-cms') : item.label"
      variant="ghost"
      size="xs"
    >
      <Themed
        v-if="isBuiltIn(item, 'dashboard') && (ctx.icon || ctx.logo)"
        :src="(ctx.icon || ctx.logo)!"
        class="size-5 object-contain"
      />
      <Box v-else-if="isBuiltIn(item, 'dashboard')" />
      <Icon v-else-if="item.icon" :name="item.icon" />
      <span
        :class="
          ctx.mode === 'preview-tab'
            ? 'max-w-24 whitespace-normal sm:max-w-none'
            : ['max-w-28 truncate', isBuiltIn(item, 'dashboard') && 'max-sm:hidden']
        "
        >{{ isBuiltIn(item, "dashboard") ? (ctx.name ?? "integral-cms") : item.label }}</span
      >
    </Button>
  </ToolbarLink>

  <ToolbarButton v-else as-child>
    <Button
      variant="ghost"
      size="xs"
      :aria-label="isBuiltIn(item, 'dashboard') ? (ctx.name ?? 'integral-cms') : item.label"
      @click="item.onClick?.()"
    >
      <Themed
        v-if="isBuiltIn(item, 'dashboard') && (ctx.icon || ctx.logo)"
        :src="(ctx.icon || ctx.logo)!"
        class="size-5 object-contain"
      />
      <Box v-else-if="isBuiltIn(item, 'dashboard')" />
      <Icon v-else-if="item.icon" :name="item.icon" />
      <span class="max-w-28 truncate" :class="isBuiltIn(item, 'dashboard') && 'max-sm:hidden'">{{
        isBuiltIn(item, "dashboard") ? (ctx.name ?? "integral-cms") : item.label
      }}</span>
    </Button>
  </ToolbarButton>
</template>
