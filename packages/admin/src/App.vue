<script setup lang="ts">
import { useHead } from "@unhead/vue";
import Icon from "./components/Icon.vue";
import Login from "./components/Login.vue";
import { useMenu } from "./composables/useMenu";
import { useSession } from "./composables/useSession";

const { user, loading, load, signOut } = useSession();
const menu = useMenu();

useHead({ titleTemplate: (title) => (title ? `${title} · Admin` : "Admin") });
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
