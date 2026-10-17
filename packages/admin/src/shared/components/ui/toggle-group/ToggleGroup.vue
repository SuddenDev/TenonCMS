<script setup lang="ts">
import type { VariantProps } from "class-variance-authority";
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import type { toggleVariants } from "@/shared/components/ui/toggle";
import { reactiveOmit, reactivePick, useVModel } from "@vueuse/core";
import { cn } from "cn";
import { ToggleGroupRoot, useForwardProps } from "reka-ui";
import { provide } from "vue";

type ToggleGroupVariants = VariantProps<typeof toggleVariants>;

const props = withDefaults(
  defineProps<
    ToggleGroupRootProps & {
      class?: HTMLAttributes["class"];
      variant?: ToggleGroupVariants["variant"];
      size?: ToggleGroupVariants["size"];
      spacing?: number;
    }
  >(),
  {
    spacing: 0,
    orientation: "horizontal",
  },
);

const emits = defineEmits<ToggleGroupRootEmits>();

provide("toggleGroup", reactivePick(props, "variant", "size", "spacing"));

const model = useVModel(props, "modelValue", emits, {
  defaultValue: props.defaultValue ?? (props.type === "multiple" ? [] : null),
  passive: true,
  deep: true,
});

const delegatedProps = reactiveOmit(
  props,
  "class",
  "size",
  "variant",
  "spacing",
  "modelValue",
  "defaultValue",
);
const forwarded = useForwardProps(delegatedProps);

function update(value: ToggleGroupRootProps["modelValue"]) {
  if (props.required && (value == null || (Array.isArray(value) && value.length === 0))) return;
  model.value = value;
}
</script>

<template>
  <ToggleGroupRoot
    v-slot="slotProps"
    data-slot="toggle-group"
    :data-size="size"
    :data-variant="variant"
    :data-spacing="spacing"
    :data-orientation="orientation"
    :style="{
      '--gap': spacing,
    }"
    v-bind="forwarded"
    :model-value="model"
    @update:model-value="update"
    :class="
      cn(
        'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[size=sm]:rounded-[min(var(--radius-md),10px)]',
        props.class,
      )
    "
  >
    <slot v-bind="slotProps" />
  </ToggleGroupRoot>
</template>
