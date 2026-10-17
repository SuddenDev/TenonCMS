<script setup lang="ts">
import type { FieldProps } from "./types";
import FieldFrame from "./FieldFrame.vue";
import MediaField from "@/modules/media/components/MediaField.vue";

const props = defineProps<FieldProps<"image">>();
const model = defineModel<any>();
</script>

<template>
  <FieldFrame v-bind="props" unlabeled v-slot="{ invalid }">
    <MediaField v-model="model" :field="field" :invalid="invalid" />
  </FieldFrame>
</template>
