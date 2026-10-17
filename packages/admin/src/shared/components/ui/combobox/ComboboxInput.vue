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
    <InputGroupAddon>
      <Icon name="search" class="size-4 shrink-0 opacity-50" />
    </InputGroupAddon>
    <ComboboxInputControl v-bind="{ ...$attrs, ...forwarded }" />
  </InputGroup>
</template>
