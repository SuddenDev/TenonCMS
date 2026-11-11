<script setup lang="ts">
import { computed } from "vue";
import { Mask } from "maska";
import { vMaska } from "maska/vue";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { text } from "@/shared/i18n";
import { Input } from "@/shared/components/ui/input";
import { ButtonGroup, ButtonGroupText } from "@/shared/components/ui/button-group";

const props = defineProps<FieldProps<"text">>();
const model = defineModel<any>();
const before = text(props.field.prefix);
const after = text(props.field.suffix);
const addon = "text-muted-foreground bg-accent/20 border-input px-3 font-normal";
const mask = props.field.mask ? new Mask({ mask: props.field.mask }) : undefined;
// An input without a mask gets no maska listeners.
const vMask = mask ? vMaska : {};
// The input shows the masked value; the model holds the raw one.
const shown = computed({
  get: () => (mask && model.value ? mask.masked(model.value) : model.value),
  set: (value: string) => (model.value = mask ? mask.unmasked(value) : value),
});
// The built-in checks apply to the raw value, so the masked input MUST NOT carry them.
const unchecked = mask ? { minlength: undefined, maxlength: undefined, pattern: undefined } : {};
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <component :is="before || after ? ButtonGroup : 'div'" class="w-full">
      <ButtonGroupText v-if="before" :class="addon">{{ before }}</ButtonGroupText>
      <div class="relative flex-1 focus-within:z-10">
        <Input
          :id="id"
          v-model="shown"
          v-mask="field.mask"
          v-bind="{ ...attrs, ...unchecked }"
          :aria-invalid="invalid"
          :class="[before && '-ms-px rounded-l-none', after && '-me-px rounded-r-none']"
        />
        <div
          v-if="suffix && shown"
          data-slot="suffix"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 flex items-center overflow-hidden border border-transparent px-2.5 text-base whitespace-pre md:text-sm"
        >
          <span class="invisible">{{ shown }}</span
          ><span class="text-muted-foreground">{{ suffix }}</span>
        </div>
      </div>
      <ButtonGroupText v-if="after" :class="addon">{{ after }}</ButtonGroupText>
    </component>
  </FieldFrame>
</template>
