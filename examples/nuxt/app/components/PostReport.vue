<script setup lang="ts">
import type { Doc } from "integral-cms";
import type { PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { ref, watch } from "vue";
import type { posts } from "../../collections/posts";

// Props stay in sync with the route, so a watcher refetches when `:id` changes.
const props = defineProps<PageContext>();
const client = createClient();
const post = ref<Doc<typeof posts.fields> | null>(null);
watch(
  () => props.params.id,
  async (id) => (post.value = await client.findById("posts", String(id), { populate: false })),
  { immediate: true },
);
</script>

<template>
  <h1 class="text-2xl font-semibold">{{ post?.title ?? "…" }}</h1>
  <p class="mt-2 text-sm text-zinc-600">id {{ params.id }}, tab {{ query.tab ?? "none" }}</p>
  <pre v-if="query.tab === 'body'" class="mt-4 text-sm">{{ post?.body }}</pre>
</template>
