<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, schema, type Schema } from './api'
import Login from './components/Login.vue'

const user = ref<{ email: string } | null>(null)
const loading = ref(true)

async function load() {
  const session = await api<{ user: { email: string } } | null>('/auth/get-session')
  user.value = session?.user ?? null
  if (user.value) schema.value = await api('/schema')
  loading.value = false
}

// The config can change while the admin is open, e.g. when editing integral.config.ts in dev.
// Unchanged responses are skipped, so a refresh does not re-render open forms.
function refreshSchema() {
  if (!user.value || document.hidden) return
  api<Schema>('/schema').then((s) => {
    if (JSON.stringify(s) !== JSON.stringify(schema.value)) schema.value = s
  }, load)
}

async function signOut() {
  await api('/auth/sign-out', { method: 'POST', body: {} })
  user.value = null
}

onMounted(() => {
  load()
  window.addEventListener('focus', refreshSchema)
})
</script>

<template>
  <div v-if="loading" />
  <Login v-else-if="!user" @done="load" />
  <div v-else class="flex min-h-screen bg-zinc-50 text-zinc-900">
    <aside class="flex w-56 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white p-4">
      <RouterLink to="/" class="font-semibold">integral-cms</RouterLink>
      <nav v-if="schema.collections" class="flex flex-col gap-1">
        <p class="text-xs font-medium uppercase text-zinc-500">Collections</p>
        <RouterLink
          v-for="(c, name) in schema.collections"
          :key="name"
          :to="`/collections/${name}`"
          class="rounded px-2 py-1 text-sm hover:bg-zinc-100"
          active-class="bg-zinc-100 font-medium"
        >
          {{ c.label ?? name }}
        </RouterLink>
      </nav>
      <nav v-if="schema.globals" class="flex flex-col gap-1">
        <p class="text-xs font-medium uppercase text-zinc-500">Globals</p>
        <RouterLink
          v-for="(g, name) in schema.globals"
          :key="name"
          :to="`/globals/${name}`"
          class="rounded px-2 py-1 text-sm hover:bg-zinc-100"
          active-class="bg-zinc-100 font-medium"
        >
          {{ g.label ?? name }}
        </RouterLink>
      </nav>
      <div class="mt-auto text-xs text-zinc-500">
        <a href="/" class="mb-3 block text-sm text-zinc-900 underline">View site</a>
        <p class="truncate">{{ user.email }}</p>
        <button class="mt-1 underline" @click="signOut">Sign out</button>
      </div>
    </aside>
    <main class="flex-1 p-8">
      <RouterView :key="$route.fullPath" />
    </main>
  </div>
</template>
