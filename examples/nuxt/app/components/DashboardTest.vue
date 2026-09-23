<script setup lang="ts">
import type { PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";

const { integral } = defineProps<PageContext>();

const client = createClient();
const posts = await client.find("posts");
const session = await client.getSession();
</script>

<template>
  <h1 class="text-2xl font-semibold">Hi {{ session?.user?.name ?? "Guest" }}</h1>
  <ul class="mt-4 flex flex-col gap-1 text-sm">
    <li v-for="post in posts" :key="post.id">
      <a :href="`${integral.base}/reports/posts/${post.id}?tab=body`" class="underline">{{
        post.title
      }}</a>
    </li>
  </ul>
</template>
