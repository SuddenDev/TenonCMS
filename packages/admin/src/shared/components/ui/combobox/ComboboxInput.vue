<script setup lang="ts">
import type { ComboboxInputEmits, ComboboxInputProps } from "reka-ui";

import type { HTMLAttributes } from "vue";
import Icon from "@/shared/components/Icon.vue";
import { useForwardPropsEmits } from "reka-ui";
import ComboboxInputControl from "./ComboboxInputControl.vue";
import { InputGroup, InputGroupAddon } from "@/shared/components/ui/input-group";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<
  ComboboxInputProps & {
    class?: HTMLAttributes["class"];
  }
>();

const emits = defineEmits<ComboboxInputEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <InputGroup>
    <InputGroupAddon class="ml-0.75">
      <Icon name="search" class="size-3 shrink-0 opacity-50" />
    </InputGroupAddon>
    <ComboboxInputControl v-bind="{ ...$attrs, ...forwarded }" />
    <slot />
  </InputGroup>
</template>
