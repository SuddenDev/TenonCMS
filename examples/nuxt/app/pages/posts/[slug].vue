<script setup lang="ts">
const route = useRoute()
const { data: post } = await useFetch(`/api/posts/${route.params.slug}`)
if (!post.value) throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })

useHead({ title: post.value.title })
</script>

<template>
  <main v-if="post">
    <NuxtLink to="/">← Home</NuxtLink>
    <h1>{{ post.title }}</h1>
    <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ post.publishedAt }}</time>
    <p style="white-space: pre-wrap">{{ post.body }}</p>
  </main>
</template>
