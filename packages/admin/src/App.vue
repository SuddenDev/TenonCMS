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

const { user, loading, load, signOut, expire, error } = useSession();
const route = useRoute();

provide(sessionKey, { user, signOut, expire });

// Applied here, so the theme also holds on screens without the sidebar, like the login.
useTheme();

// The same layout component is patched, not remounted, so it survives navigation.
const layout = computed(() => layouts[route.meta.layout ?? "default"]);

// A view with child routes stays mounted while its children change, e.g. the list next to a document.
// A query change never remounts: views and host pages follow it themselves.
const viewKey = computed(() =>
  route.matched.length > 1
    ? route.matched[0]!.path.replace(/:(\w+)/g, (_, k: string) => String(route.params[k]))
    : route.path,
);

const { name } = useBrand();
const options = inject(optionsKey, {});
const favicon = computed(() => options.favicon);

useHead(() => ({
  titleTemplate: (title) => (title ? `${title} · ${name.value}` : name.value),
  link: !favicon.value
    ? []
    : typeof favicon.value === "string"
      ? [{ rel: "icon", href: favicon.value }]
      : [
          { rel: "icon", href: favicon.value.light, media: "(prefers-color-scheme: light)" },
          { rel: "icon", href: favicon.value.dark, media: "(prefers-color-scheme: dark)" },
        ],
}));
</script>

<template>
  <div v-if="loading" />
  <p v-else-if="error" role="alert" class="p-4">{{ error }}</p>
  <Login v-else-if="!user" @done="load" />
  <component :is="layout" v-else>
    <RouterView :key="viewKey" />
  </component>
</template>
