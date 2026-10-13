<script setup lang="ts">
const { data } = await useIntegral().find("pages", { select: { title: true, path: true } });
const pages = computed(() => data.value?.filter((page) => page.path));
const { localePath } = useLocale();
</script>

<template>
  <header>
    <nav aria-label="Main">
      <NuxtLink to="/"><strong>Home</strong></NuxtLink>
      <NuxtLink to="/#posts">Posts</NuxtLink>
      <NuxtLink v-for="page in pages" :key="page.id" :to="localePath(page.path!)">
        {{ page.title }}
      </NuxtLink>
      <a href="/admin">Admin</a>
    </nav>
    <LocaleSwitch />
  </header>
</template>

<style scoped>
nav {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
