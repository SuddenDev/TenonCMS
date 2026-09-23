<script setup lang="ts">
import { createClient } from 'integral-cms/client'

const posts = await createClient().find('posts')
</script>

<template>
  <h1 class="text-2xl font-semibold">Stats</h1>
  <p class="mt-2 text-sm text-zinc-600">{{ posts.length }} post(s)</p>
  <ul class="mt-4 flex flex-col gap-1 text-sm">
    <li v-for="post in posts" :key="post.id">
      <a :href="`/admin/reports/posts/${post.id}?tab=body`" class="underline">{{ post.title }}</a>
    </li>
  </ul>
</template>
