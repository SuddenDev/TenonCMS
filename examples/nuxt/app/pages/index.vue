<script setup lang="ts">
const cms = useIntegral()
const { data: site } = await cms.getGlobal('site')
const { data: posts } = await cms.find('posts')

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
