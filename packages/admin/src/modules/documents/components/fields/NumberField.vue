<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import NumberInput from "./NumberInput.vue";
import { Slider } from "@/shared/components/ui/slider";

const props = defineProps<FieldProps<"number">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, required, invalid }">
    <div v-if="field.appearance === 'slider'" class="flex min-h-9 items-center gap-4">
      <Slider
        :id="id"
        :model-value="[model ?? field.min ?? 0]"
        :min="field.min"
        :max="field.max"
        :step="field.step ?? 1"
        :disabled="field.readOnly"
        :aria-invalid="invalid"
        class="flex-1"
        @update:model-value="(v) => (model = v?.[0] ?? null)"
      />
      <output :for="id" class="text-muted-foreground w-12 text-right text-sm tabular-nums">{{
        model ?? "–"
      }}</output>
    </div>
    <NumberInput
      v-else
      :id="id"
      v-model="model"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :placeholder="attrs.placeholder"
      :disabled="field.readOnly"
      :required="required"
      :invalid="invalid"
      :controls="
        field.appearance === 'stepper'
          ? 'stepper'
          : field.appearance === 'plain'
            ? 'none'
            : 'chevrons'
      "
    />
  </FieldFrame>
</template>
