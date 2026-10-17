<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Input } from "@/shared/components/ui/input";
import { Slider } from "@/shared/components/ui/slider";

const props = defineProps<FieldProps<"number">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
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
    <Input
      v-else
      :id="id"
      v-model.number="model"
      type="number"
      v-bind="attrs"
      :aria-invalid="invalid"
    />
  </FieldFrame>
</template>
