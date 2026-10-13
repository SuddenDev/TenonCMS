<script setup lang="ts">
// The preview applies a draft only to a page in the draft's language, read from `<html lang>`.
const { locale } = useLocale();
useHead({ htmlAttrs: { lang: () => locale.value } });
</script>

<template>
  <NuxtPage />
</template>
