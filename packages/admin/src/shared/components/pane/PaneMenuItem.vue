<script lang="ts">
import type { PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import type { RouterLinkProps } from "vue-router";

export interface PaneMenuItemProps extends Omit<PrimitiveProps, "asChild"> {
  to?: RouterLinkProps["to"];
  icon?: string;
  label?: string;
  subtitle?: string;
  active?: boolean;
  class?: HTMLAttributes["class"];
}
</script>
<script setup lang="ts">
import { reactiveOmit } from "@vueuse/core";
import { Primitive, useForwardExpose, useForwardProps } from "reka-ui";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import Icon from "@/shared/components/Icon.vue";
import { cn } from "@/shared/utils";
import { injectPaneMenuContext } from "./context";

const props = withDefaults(defineProps<PaneMenuItemProps>(), { as: "button", active: false });

defineSlots<{
  default?(): any;
  icon?(): any;
  subtitle?(): any;
  end?(): any;
}>();

const forwarded = useForwardProps(
  reactiveOmit(props, "class", "to", "icon", "label", "subtitle", "active"),
);
const { forwardRef } = useForwardExpose();
const menu = injectPaneMenuContext({ layout: ref("normal") });

// Row heights
const sizes = {
  compact: { row: "h-8 gap-1.5", icon: "size-5" },
  normal: { row: "h-12 gap-2", icon: "size-8 border" },
  detailed: { row: "h-14 pr-3 pl-2 gap-2.5", icon: "size-10 border" },
} as const;
const size = computed(() => sizes[menu.layout.value]);

// With `to`, the item is a `RouterLink`. A button gets `type="button"`, so it does not submit a form.
const elementProps = computed(() => {
  if (props.to) return { as: RouterLink, to: props.to };
  return props.as === "button" ? { type: "button" } : {};
});
</script>

<template>
  <Primitive
    :ref="forwardRef"
    v-bind="{ ...forwarded, ...elementProps }"
    data-slot="pane-menu-item"
    :data-active="active"
    :data-layout="menu.layout.value"
    :class="
      cn(
        'group/pane-menu-item flex w-full items-center rounded-sm py-1 pr-2.5 pl-2 text-left text-sm',
        size.row,
        'not-data-[active=true]:hover:bg-muted data-[active=true]:bg-accent/70 data-[active=true]:text-accent-foreground',
        props.class,
      )
    "
  >
    <span
      v-if="$slots.icon || icon"
      data-slot="pane-menu-item-icon"
      :class="
        cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-[0.5rem] [&_img]:size-full [&_img]:object-cover',
          size.icon,
          active && 'border-muted-foreground/50',
        )
      "
    >
      <slot name="icon"><Icon :name="icon!" class="text-xs opacity-70" /></slot>
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span data-slot="pane-menu-item-label" class="truncate">
        <slot>{{ label }}</slot>
      </span>
      <span
        v-if="menu.layout.value !== 'compact'"
        data-slot="pane-menu-item-subtitle"
        class="truncate text-xs opacity-60 empty:hidden"
      >
        <slot name="subtitle">{{ subtitle }}</slot>
      </span>
    </span>
    <span v-if="$slots.end" data-slot="pane-menu-item-end" class="flex shrink-0 [&>svg]:opacity-50">
      <slot name="end" />
    </span>
  </Primitive>
</template>
