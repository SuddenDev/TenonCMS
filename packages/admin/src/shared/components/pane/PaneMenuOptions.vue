<script lang="ts">
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from "reka-ui";
import type { PaneLayout, PaneSort } from "./context";

export interface PaneMenuOptionsProps extends DropdownMenuRootProps {
  sorts: PaneSort[];
  defaultSort?: string;
  defaultLayout?: PaneLayout;
}

export type PaneMenuOptionsEmits = DropdownMenuRootEmits;
</script>
<script setup lang="ts">
import { reactivePick } from "@vueuse/core";
import { useForwardPropsEmits } from "reka-ui";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { DropdownMenuItem } from "reka-ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const props = withDefaults(defineProps<PaneMenuOptionsProps>(), {
  defaultSort: (props) => props.sorts[0]?.value ?? "",
  defaultLayout: "normal",
});
const emits = defineEmits<PaneMenuOptionsEmits>();
const sort = defineModel<string>("sort");
const layout = defineModel<PaneLayout>("layout");

const forwarded = useForwardPropsEmits(
  reactivePick(props, "open", "defaultOpen", "modal", "dir"),
  emits,
);
const layouts: { value: PaneLayout; label: string; icon: string }[] = [
  { value: "compact", label: "Compact view", icon: "rows-4" },
  { value: "normal", label: "Normal view", icon: "rows-3" },
  { value: "detailed", label: "Detailed view", icon: "rows-2" },
];
</script>

<template>
  <DropdownMenu v-bind="forwarded">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" aria-label="List options">
        <Icon name="ellipsis" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-52">
      <template v-if="sorts.length">
        <DropdownMenuLabel>Sort</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="sort">
          <DropdownMenuRadioItem v-for="s in sorts" :key="s.value" :value="s.value">
            {{ s.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuItem
          v-if="sort !== defaultSort"
          @select="sort = defaultSort"
          class="text-muted-foreground hover:text-accent-foreground w-full cursor-pointer px-2 py-1.5 text-left text-xs underline transition-colors"
        >
          Reset sort
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuLabel>Layout</DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="layout">
        <DropdownMenuRadioItem v-for="l in layouts" :key="l.value" :value="l.value">
          <Icon :name="l.icon" />
          {{ l.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuItem
        v-if="layout !== defaultLayout"
        @select="layout = defaultLayout"
        class="text-muted-foreground hover:text-accent-foreground w-full cursor-pointer px-2 py-1.5 text-left text-xs underline transition-colors"
      >
        Reset view
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
