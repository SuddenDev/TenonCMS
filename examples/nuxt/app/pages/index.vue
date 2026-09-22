<script setup lang="ts">
const { data: site } = await useFetch('/api/site')
const { data: posts } = await useFetch('/api/posts')

useHead({ title: () => site.value?.title ?? 'My site' })
</script>

<template>
  <main>
    <h1>{{ site?.title ?? 'My site' }}</h1>
    <p v-if="site?.tagline">{{ site.tagline }}</p>
    <ul>
      <li v-for="post in posts" :key="post.id">
        <NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink>
        <template v-if="post.featured"> ★</template>
      </li>
    </ul>
    <p><a href="/admin">Admin</a></p>
  </main>
</template>
