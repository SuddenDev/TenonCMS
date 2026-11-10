<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { text } from "@/shared/i18n";
import { Input } from "@/shared/components/ui/input";
import { ButtonGroup, ButtonGroupText } from "@/shared/components/ui/button-group";

const props = defineProps<FieldProps<"text">>();
const model = defineModel<any>();
const before = text(props.field.prefix);
const after = text(props.field.suffix);
const addon = "text-muted-foreground bg-background border-input px-3 font-normal";
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <component :is="before || after ? ButtonGroup : 'div'" class="w-full">
      <ButtonGroupText v-if="before" :class="addon">{{ before }}</ButtonGroupText>
      <div class="relative flex-1 focus-within:z-10">
        <Input
          :id="id"
          v-model="model"
          v-bind="attrs"
          :aria-invalid="invalid"
          :class="[before && '-ms-px rounded-l-none', after && '-me-px rounded-r-none']"
        />
        <!-- An invisible copy of the value pushes the suffix right behind the typed text. It MUST match the input's padding and font. -->
        <!-- ponytail: a value wider than the input scrolls it, and the suffix then no longer lines up. -->
        <div
          v-if="suffix && model"
          data-slot="suffix"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 flex items-center overflow-hidden border border-transparent px-2.5 text-base whitespace-pre md:text-sm"
        >
          <span class="invisible">{{ model }}</span
          ><span class="text-muted-foreground">{{ suffix }}</span>
        </div>
      </div>
      <ButtonGroupText v-if="after" :class="addon">{{ after }}</ButtonGroupText>
    </component>
  </FieldFrame>
</template>
