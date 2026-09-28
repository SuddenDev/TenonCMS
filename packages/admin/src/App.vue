<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { inject, onMounted, onUnmounted, ref } from "vue";
import { client, schema } from "./api";
import Login from "./components/Login.vue";
import { optionsKey, pagePath } from "./options";

const pages = Object.entries(inject(optionsKey, {}).pages ?? {}).filter(([, p]) => p.label);
const user = ref<{ email: string } | null>(null);
const loading = ref(true);

useHead({ titleTemplate: (title) => (title ? `${title} · Admin` : "Admin") });

async function load() {
  // `/schema` answers 401 without a session, so both requests can run at once.
  const [session, s] = await Promise.all([
    client.getSession(),
    client.getSchema().catch(() => undefined),
  ]);
  user.value = session?.user ?? null;
  if (user.value && s) schema.value = s;
  loading.value = false;
}

// The config can change while the admin is open, e.g. when editing integral.config.ts in dev.
// Unchanged responses are skipped, so a refresh does not re-render open forms.
function refreshSchema() {
  if (!user.value || document.hidden) return;
  client.getSchema().then((s) => {
    if (JSON.stringify(s) !== JSON.stringify(schema.value)) schema.value = s;
  }, load);
}

async function signOut() {
  await client.signOut();
  user.value = null;
}

onMounted(() => {
  load();
  window.addEventListener("focus", refreshSchema);
});
onUnmounted(() => window.removeEventListener("focus", refreshSchema));
</script>

<template>
  <div v-if="loading" />
  <Login v-else-if="!user" @done="load" />
  <div v-else class="flex min-h-screen bg-zinc-50 text-zinc-900">
    <aside class="flex w-56 shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white p-4">
      <RouterLink to="/" class="font-semibold">integral-cms</RouterLink>
      <nav v-if="schema.collections" class="flex flex-col gap-1">
        <p class="text-xs font-medium text-zinc-500 uppercase">Collections</p>
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
        <p class="text-xs font-medium text-zinc-500 uppercase">Globals</p>
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
      <nav v-if="pages.length" class="flex flex-col gap-1">
        <p class="text-xs font-medium text-zinc-500 uppercase">Pages</p>
        <RouterLink
          v-for="[key, p] in pages"
          :key="key"
          :to="pagePath(key, p)"
          class="rounded px-2 py-1 text-sm hover:bg-zinc-100"
          active-class="bg-zinc-100 font-medium"
        >
          {{ p.label }}
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
