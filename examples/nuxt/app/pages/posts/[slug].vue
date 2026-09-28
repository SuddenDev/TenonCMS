<script setup lang="ts">
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
    <h1
      :style="
        post.color ? { borderLeft: `4px solid ${post.color}`, paddingLeft: '8px' } : undefined
      "
    >
      {{ post.title }}
    </h1>
    <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ post.publishedAt }}</time>
    <p style="white-space: pre-wrap">{{ post.body }}</p>
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
