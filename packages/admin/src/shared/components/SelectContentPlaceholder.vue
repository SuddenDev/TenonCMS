<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="grid h-full min-h-0 flex-1 place-items-center">
    <h1 class="text-muted-foreground text-sm">{{ t("nav.selectContent") }}</h1>
  </div>
</template>

<style lang="scss"></style>
