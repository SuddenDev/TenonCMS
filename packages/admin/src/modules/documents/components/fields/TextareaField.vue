<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import { Textarea } from "@/shared/components/ui/textarea";

const props = defineProps<FieldProps<"textarea">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" v-slot="{ id, attrs, invalid }">
    <Textarea :id="id" v-model="model" class="min-h-40" v-bind="attrs" :aria-invalid="invalid" />
  </FieldFrame>
</template>
