<script setup lang="ts">
import { edit } from "tenoncms/preview";

const route = useRoute();
const cms = useTenon();
const { data: post, status } = await cms.findOne("posts", () => ({
  where: { slug: String(route.params.slug) },
}));
watchEffect(() => {
  if (status.value === "success" && !post.value)
    showError({ statusCode: 404, statusMessage: "Post not found", fatal: true });
});
useHead({ title: () => post.value?.title ?? "" });
</script>

<template>
  <main v-if="post">
    <p><NuxtLink to="/">All posts</NuxtLink></p>
    <h1 :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</h1>
    <p :data-cms="edit('posts', post.id, 'body')" style="white-space: pre-wrap">{{ post.body }}</p>
  </main>
</template>
