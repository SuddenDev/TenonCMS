<script lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

export interface PaneSearchProps extends PrimitiveProps {
  placeholder?: string;
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactivePick } from "@vueuse/core";
import { Primitive, useForwardExpose, useForwardProps } from "reka-ui";
import Icon from "@/shared/components/Icon.vue";
import { cn } from "@/shared/utils";
import { Button } from "../ui/button";

// A search input that stays at the top of the pane while the list scrolls.
const props = withDefaults(defineProps<PaneSearchProps>(), {
  as: "div",
  placeholder: "Search list",
});
const query = defineModel<string>({ default: "" });
// Picks instead of omitting: the runtime props also hold `modelValue`, which MUST NOT reach the root.
const forwarded = useForwardProps(reactivePick(props, "as", "asChild"));
const { forwardRef } = useForwardExpose();
</script>

<template>
  <Primitive
    :ref="forwardRef"
    v-bind="forwarded"
    data-slot="pane-search"
    :class="
      cn(
        'border-border bg-background sticky top-0 z-10 flex h-11 items-center gap-2 border-b pr-2.5 pl-3',
        props.class,
      )
    "
  >
    <Icon name="search" class="text-muted-foreground text-sm" />
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
      @keydown.esc="query = ''"
    />
    <Button
      v-if="query"
      type="button"
      variant="ghost"
      size="icon-xs"
      class="text-muted-foreground hover:text-foreground shrink-0"
      aria-label="Clear search"
      @click="query = ''"
    >
      <Icon name="x" class="text-xs" />
    </Button>
  </Primitive>
</template>
