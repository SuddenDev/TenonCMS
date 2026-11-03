<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Input } from "@/shared/components/ui/input";

const props = defineProps<FieldProps<"text">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <div class="relative">
      <Input :id="id" v-model="model" v-bind="attrs" :aria-invalid="invalid" />
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
  </FieldFrame>
</template>
