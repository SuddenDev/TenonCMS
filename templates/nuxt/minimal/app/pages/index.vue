<script setup lang="ts">
import { edit } from "tenoncms/preview";

const cms = useTenon();
const { data: posts } = await cms.find("posts");
useHead({ title: "My site" });
</script>

<template>
  <main>
    <h1>Posts</h1>
    <ul>
      <li v-for="post in posts" :key="post.id">
        <NuxtLink :to="`/posts/${post.slug}`" :data-cms="edit('posts', post.id, 'title')">
          {{ post.title }}
        </NuxtLink>
      </li>
    </ul>
    <p><a href="/admin">Admin</a></p>
  </main>
</template>
