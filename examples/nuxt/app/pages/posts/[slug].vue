<script setup lang="ts">
import { edit } from "integral-cms/preview";

const route = useRoute();
const { data: post } = await useIntegral().findOne("posts", {
  where: { slug: String(route.params.slug) },
  populate: true,
  depth: 1,
});
if (!post.value)
  throw createError({
    statusCode: 404,
    statusMessage: "Post not found",
    fatal: true,
  });

useHead({ title: post.value.title });
</script>

<template>
  <main v-if="post">
    <NuxtLink to="/">← Home</NuxtLink>
    <h1 :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</h1>
    <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ post.publishedAt }}</time>
    <img
      v-if="post.hero"
      :src="post.hero.src"
      :srcset="post.hero.srcset"
      sizes="(min-width: 720px) 720px, 100vw"
      :width="post.hero.width"
      :height="post.hero.height"
      :alt="post.hero.alt ?? ''"
      style="max-width: 100%; height: auto"
    />
    <p :data-cms="edit('posts', post.id, 'body')" style="white-space: pre-wrap">{{ post.body }}</p>
    <div class="json">
      <pre>{{ post }}</pre>
    </div>
  </main>
</template>
<style>
.json {
  background-color: #f5f5f5;
  border-radius: 0.25rem;
  padding: 0.25rem 1rem;
  display: flex;
}
</style>
