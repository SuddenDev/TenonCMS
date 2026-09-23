<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { client, schema } from '../api'

const name = useRoute().params.name as string
const collection = computed(() => schema.value.collections?.[name])
const titleField = computed(() => collection.value?.titleField ?? Object.keys(collection.value?.fields ?? {})[0])
const docs = ref<Record<string, any>[]>([])

client.find(name).then((d) => (docs.value = d))
</script>

<template>
  <template v-if="collection">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ collection.label ?? name }}</h1>
      <RouterLink :to="`/collections/${name}/new`" class="btn">New</RouterLink>
    </div>
    <ul class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
      <li v-for="doc in docs" :key="doc.id">
        <RouterLink :to="`/collections/${name}/${doc.id}`" class="flex justify-between px-4 py-3 text-sm hover:bg-zinc-50">
          <span>{{ doc[titleField] || '(untitled)' }}</span>
          <span class="text-zinc-500">{{ new Date(doc.updatedAt as string).toLocaleString() }}</span>
        </RouterLink>
      </li>
      <li v-if="!docs.length" class="px-4 py-3 text-sm text-zinc-500">Nothing here yet.</li>
    </ul>
  </template>
</template>
