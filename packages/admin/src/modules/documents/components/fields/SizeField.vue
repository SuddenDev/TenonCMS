<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import NumberInput from "./NumberInput.vue";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";

const props = defineProps<FieldProps<"size">>();
const model = defineModel<{ value: number; unit: string } | null>();
const { t } = useI18n();
// Kept apart from the value, so a unit picked before the number is typed is not lost.
const unit = ref(model.value?.unit ?? props.field.units[0]);
watch(
  () => model.value?.unit,
  (u) => u && (unit.value = u),
);
watch(unit, (u) => {
  if (model.value && model.value.unit !== u) model.value = { ...model.value, unit: u };
});

function setValue(value: number | null | undefined) {
  model.value = value == null ? null : { value, unit: unit.value };
}
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, required, invalid }">
    <ButtonGroup class="w-full">
      <NumberInput
        :id="id"
        :model-value="model?.value ?? null"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :placeholder="attrs.placeholder"
        :disabled="field.readOnly"
        :required="required"
        :invalid="invalid"
        class="-me-px flex-1 focus-within:z-10"
        input-class="rounded-r-none"
        @update:model-value="setValue"
      />
      <NativeSelect
        v-model="unit"
        :disabled="field.readOnly"
        :aria-label="t('size.unit')"
        class="[&_select]:text-muted-foreground [&_select]:hover:text-foreground [&_select]:field-sizing-content [&_select]:rounded-l-none"
      >
        <NativeSelectOption v-for="u in field.units" :key="u" :value="u">{{
          u
        }}</NativeSelectOption>
      </NativeSelect>
    </ButtonGroup>
  </FieldFrame>
</template>
