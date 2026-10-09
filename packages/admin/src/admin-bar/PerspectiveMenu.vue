<script setup lang="ts">
import { ToolbarButton } from "reka-ui";
import type { AdminBarContext } from "../../../core/src/admin/index.d.ts";
// Deep per-icon import, an exception to the lazy `Icon.vue` rule: the bar MUST NOT load Icon.vue's chunk with every icon for its own glyphs.
import ChevronDown from "@lucide/vue/dist/esm/icons/chevron-down.mjs";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const props = defineProps<{ ctx: AdminBarContext }>();

const perspectives = [
  { value: "drafts", label: "Drafts" },
  { value: "published", label: "Published" },
] as const;

const select = (value: unknown) => {
  const perspective = value as AdminBarContext["perspective"];
  if (perspective !== props.ctx.perspective) props.ctx.setPerspective(perspective);
};
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <ToolbarButton as-child>
        <Button variant="ghost" size="xs">
          <span
            :data-perspective="ctx.perspective"
            class="size-1.5 rounded-full data-[perspective=drafts]:bg-amber-500 data-[perspective=published]:bg-emerald-500"
            aria-hidden="true"
          />
          {{ ctx.perspective === "drafts" ? "Drafts" : "Published" }}
          <ChevronDown class="text-muted-foreground" />
        </Button>
      </ToolbarButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :side="ctx.position.startsWith('top-') ? 'bottom' : 'top'">
      <DropdownMenuRadioGroup :model-value="ctx.perspective" @update:model-value="select">
        <DropdownMenuRadioItem
          v-for="p in perspectives"
          :key="p.value"
          :value="p.value"
          class="py-1 text-xs"
        >
          {{ p.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
