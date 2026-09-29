<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, provide } from "vue";
import { useRoute } from "vue-router";
import Login from "@/modules/auth/components/Login.vue";
import { useSession } from "@/modules/auth/composables/useSession";
import { layouts } from "@/shared/layouts";
import { useTheme } from "@/shared/composables/useTheme";
import { useBrand } from "@/shared/composables/useBrand";
import { optionsKey, sessionKey } from "@/shared/options";

const { user, loading, load, signOut } = useSession();
const route = useRoute();

provide(sessionKey, { user, signOut });

// Applied here, so the theme also holds on screens without the sidebar, like the login.
useTheme();

// The same layout component is patched, not remounted, so it survives navigation.
const layout = computed(() => layouts[route.meta.layout ?? "default"]);

const { name } = useBrand();
const favicon = inject(optionsKey, {}).favicon;

useHead({
  titleTemplate: (title) => (title ? `${title} · ${name}` : name),
  link: !favicon
    ? []
    : typeof favicon === "string"
      ? [{ rel: "icon", href: favicon }]
      : [
          { rel: "icon", href: favicon.light, media: "(prefers-color-scheme: light)" },
          { rel: "icon", href: favicon.dark, media: "(prefers-color-scheme: dark)" },
        ],
});
</script>

<template>
  <div v-if="loading" />
  <Login v-else-if="!user" @done="load" />
  <component :is="layout" v-else>
    <RouterView :key="$route.fullPath" />
  </component>
</template>
