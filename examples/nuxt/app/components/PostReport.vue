<script setup lang="ts">
import type { PageContext } from 'integral-cms/admin'
import { ref, watch } from 'vue'

// Props stay in sync with the route, so a watcher refetches when `:id` changes.
const props = defineProps<PageContext>()
const post = ref<{ title: string; body?: string } | null>(null)
watch(
  () => props.params.id,
  async (id) => (post.value = await props.api(`/collections/posts/${id}`)),
  { immediate: true },
)
</script>

<template>
  <h1 class="text-2xl font-semibold">{{ post?.title ?? '…' }}</h1>
  <p class="mt-2 text-sm text-zinc-600">id {{ params.id }}, tab {{ query.tab ?? 'none' }}</p>
  <pre v-if="query.tab === 'body'" class="mt-4 text-sm">{{ post?.body }}</pre>
</template>
