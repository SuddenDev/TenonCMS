<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { FieldDescription, FieldTitle } from "@/shared/components/ui/field";

defineProps<{ url?: string; title: string; description?: string }>();
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2">
    <FieldTitle>{{ t("seo.preview") }}</FieldTitle>
    <FieldDescription class="-mt-1">{{ t("seo.previewNote") }}</FieldDescription>
    <div class="bg-card text-card-foreground max-w-xl rounded-lg border p-4 shadow-sm">
      <p class="text-muted-foreground truncate text-xs">{{ url }}</p>
      <p class="text-primary mt-1 truncate text-lg leading-snug">{{ title }}</p>
      <p v-if="description" class="text-muted-foreground mt-1 line-clamp-2 text-sm">
        {{ description }}
      </p>
    </div>
  </div>
</template>
