<script setup lang="ts">
const { locales, locale, switchLocale } = useLocale();
type Code = Parameters<typeof switchLocale>[0];
</script>

<template>
  <nav v-if="locales.length" aria-label="Language">
    <template v-for="code in locales" :key="code">
      <strong v-if="code === locale">{{ code }}</strong>
      <a v-else href="#" :hreflang="code" @click.prevent="switchLocale(code as Code)">{{ code }}</a>
      {{ " " }}
    </template>
  </nav>
</template>
