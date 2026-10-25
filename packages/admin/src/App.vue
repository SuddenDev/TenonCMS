<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, provide, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "@/modules/auth/composables/useSession";
import { layouts } from "@/shared/layouts";
import { useTheme } from "@/shared/composables/useTheme";
import { useBrand } from "@/shared/composables/useBrand";
import { CONTENT, optionsKey, sessionKey } from "@/shared/options";
import { Toaster } from "@/shared/components/ui/sonner";

const { user, loading, load, signOut, expire, error } = useSession();
const route = useRoute();
const router = useRouter();

provide(sessionKey, { user, load, signOut, expire });

// Without a session, an admin view sends the visitor to the sign-in, which sends them back after it.
watchEffect(() => {
  if (loading.value || error.value) return;
  if (!user.value && !route.meta.auth)
    void router.replace({
      path: "/login",
      query: route.path === CONTENT ? {} : { redirect: route.fullPath },
    });
  else if (user.value && route.meta.guest) void router.replace(back(route.query.redirect));
  else if (user.value && route.meta.admin && user.value.role !== "admin") void router.replace("/");
});

// Only a path inside the admin, never another origin.
function back(redirect: unknown) {
  return typeof redirect === "string" && /^\/(?!\/)/.test(redirect) ? redirect : "/";
}

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
  <RouterView v-if="route.meta.auth" :key="viewKey" />
  <div v-else-if="loading" />
  <p v-else-if="error" role="alert" class="p-4">{{ error }}</p>
  <div v-else-if="!user || (route.meta.admin && user.role !== 'admin')" />
  <component :is="layout" v-else>
    <RouterView :key="viewKey" />
  </component>
  <Toaster />
</template>
