<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { CONTENT } from "@/shared/options";

const { t } = useI18n();
useHead({ title: () => t("notFound.title") });
</script>

<template>
  <h1 class="text-2xl font-semibold">{{ t("notFound.heading") }}</h1>
  <p class="text-muted-foreground mt-2 text-sm">
    {{ t("notFound.text") }}
    <RouterLink :to="CONTENT" class="underline">{{ t("notFound.back") }}</RouterLink>
  </p>
</template>
