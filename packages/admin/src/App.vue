<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import { client, schema } from "./api";
import Icon from "./components/Icon.vue";
import Login from "./components/Login.vue";
import { optionsKey, pagePath } from "./options";

const pages = Object.entries(inject(optionsKey, {}).pages ?? {});
// One list for collections, globals and pages, by `order`. Equal orders keep their definition order.
const menu = computed(() =>
  [
    ...Object.entries(schema.value.collections ?? {}).map(([name, c]) => ({
      label: c.label ?? name,
      icon: "folder",
      order: 10,
      to: `/collections/${name}`,
    })),
    ...Object.entries(schema.value.globals ?? {}).map(([name, g]) => ({
      label: g.label ?? name,
      icon: "settings",
      order: 20,
      to: `/globals/${name}`,
    })),
    ...pages.flatMap(([key, p]) =>
      p.menu ? [{ icon: "file", order: 30, ...p.menu, to: pagePath(key, p) }] : [],
    ),
  ].sort((a, b) => a.order - b.order),
);
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
      <nav class="flex flex-col gap-1">
        <RouterLink
          v-for="item in menu"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100"
          active-class="bg-zinc-100 font-medium"
        >
          <Icon :name="item.icon" />
          {{ item.label }}
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
