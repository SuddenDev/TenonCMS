<script setup lang="ts">
const { locales, locale, switchLocalePath } = useLocale();
type Code = Parameters<typeof switchLocalePath>[0];
</script>

<template>
  <nav v-if="locales.length" aria-label="Language">
    <template v-for="code in locales" :key="code">
      <strong v-if="code === locale">{{ code }}</strong>
      <NuxtLink v-else :to="switchLocalePath(code as Code)" :hreflang="code">{{ code }}</NuxtLink>
      {{ " " }}
    </template>
  </nav>
</template>
