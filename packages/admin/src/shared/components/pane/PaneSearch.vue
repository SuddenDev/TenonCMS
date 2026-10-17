<script lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { Input } from "../ui/input";

export interface PaneSearchProps extends PrimitiveProps {
  placeholder?: string;
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactivePick } from "@vueuse/core";
import { Primitive, useForwardExpose, useForwardProps } from "reka-ui";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { cn } from "@/shared/utils";
import { Button } from "../ui/button";

// A search input that stays at the top of the pane while the list scrolls.
const props = withDefaults(defineProps<PaneSearchProps>(), { as: "div" });
const { t } = useI18n();
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
    <Input
      v-model="query"
      type="text"
      :placeholder="placeholder ?? t('pane.search')"
      :aria-label="placeholder ?? t('pane.search')"
      class="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
      @keydown.esc="query = ''"
    />
    <Button
      v-if="query"
      type="button"
      variant="ghost"
      size="icon-xs"
      class="text-muted-foreground hover:text-foreground shrink-0"
      :aria-label="t('pane.clearSearch')"
      @click="query = ''"
    >
      <Icon name="x" class="text-xs" />
    </Button>
  </Primitive>
</template>
