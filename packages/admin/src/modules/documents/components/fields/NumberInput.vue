<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useI18n } from "vue-i18n";
import { useAdminLocale } from "@/shared/i18n";
import Icon from "@/shared/components/Icon.vue";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/shared/components/ui/number-field";

/**
 * A number input. Typing follows the admin language, e.g. `9,99` in German. `controls`: up and down chevrons at the end
 * (default), minus and plus on both sides, or no buttons.
 */
const props = withDefaults(
  defineProps<{
    id?: string;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
    controls?: "chevrons" | "stepper" | "none";
    class?: HTMLAttributes["class"];
    inputClass?: HTMLAttributes["class"];
  }>(),
  { controls: "chevrons" },
);
const model = defineModel<number | null>();
const { t } = useI18n();
const { locale } = useAdminLocale();
// Without grouping and rounding, the stored number is the one the editor typed.
const format: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 20 };
const padding = { chevrons: "pr-8", stepper: "px-9 text-center", none: "" }[props.controls];
</script>

<template>
  <NumberField
    :id="id"
    :model-value="model"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :required="required"
    :locale="locale"
    :format-options="format"
    :class="props.class"
    @update:model-value="(v) => (model = v ?? null)"
  >
    <NumberFieldInput
      :placeholder="placeholder"
      :aria-invalid="invalid"
      :class="[padding, inputClass]"
    />
    <div
      v-if="controls === 'chevrons'"
      class="border-input absolute inset-y-0 right-0 flex flex-col border-l"
    >
      <NumberFieldIncrement :aria-label="t('number.increase')" class="h-1/2 w-6">
        <Icon name="chevron-up" class="size-3 shrink-0" aria-hidden="true" />
      </NumberFieldIncrement>
      <NumberFieldDecrement
        :aria-label="t('number.decrease')"
        class="border-input h-1/2 w-6 border-t"
      >
        <Icon name="chevron-down" class="size-3 shrink-0" aria-hidden="true" />
      </NumberFieldDecrement>
    </div>
    <template v-else-if="controls === 'stepper'">
      <NumberFieldDecrement
        :aria-label="t('number.decrease')"
        class="absolute inset-y-0 left-0 w-9"
      >
        <Icon name="minus" class="size-4" aria-hidden="true" />
      </NumberFieldDecrement>
      <NumberFieldIncrement
        :aria-label="t('number.increase')"
        class="absolute inset-y-0 right-0 w-9"
      >
        <Icon name="plus" class="size-4" aria-hidden="true" />
      </NumberFieldIncrement>
    </template>
  </NumberField>
</template>
