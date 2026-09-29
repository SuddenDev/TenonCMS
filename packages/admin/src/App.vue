<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, provide } from "vue";
import { useRoute } from "vue-router";
import Login from "@/modules/auth/components/Login.vue";
import { useSession } from "@/modules/auth/composables/useSession";
import { layouts } from "@/shared/layouts";
import { useTheme } from "@/shared/composables/useTheme";
import { sessionKey } from "@/shared/options";

const { user, loading, load, signOut } = useSession();
const route = useRoute();

provide(sessionKey, { user, signOut });

// Applied here, so the theme also holds on screens without the sidebar, like the login.
useTheme();

// The same layout component is patched, not remounted, so it survives navigation.
const layout = computed(() => layouts[route.meta.layout ?? "default"]);

useHead({ titleTemplate: (title) => (title ? `${title} · Admin` : "Admin") });
</script>

<template>
  <div v-if="loading" />
  <Login v-else-if="!user" @done="load" />
  <component :is="layout" v-else>
    <RouterView :key="$route.fullPath" />
  </component>
</template>
