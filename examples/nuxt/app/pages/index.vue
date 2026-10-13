<script setup lang="ts">
const cms = useIntegral();
const { data: general } = await cms.getGlobal("general");
const { data: posts } = await cms.find("posts");

useHead({ title: () => general.value?.title ?? "My site" });
</script>

<template>
  <AppHeader />
  <main>
    <h1>{{ general?.title ?? "My site" }}</h1>
    <p v-if="general?.tagline">{{ general.tagline }}</p>
    <ul id="posts">
      <li v-for="post in posts" :key="post.id">
        <NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink>
        <template v-if="post.featured"> ★</template>
      </li>
    </ul>
  </main>
</template>
