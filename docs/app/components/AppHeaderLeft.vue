<script setup lang="ts">
import type { ContentNavigationItem } from "@nuxt/content";
import { getFirstPagePath } from "docus/app/composables/useSubNavigation";

const appConfig = useAppConfig();
const route = useRoute();
const navigation = inject<Ref<ContentNavigationItem[]>>("navigation");

const sections = computed(() =>
  (navigation?.value ?? [])
    .filter((item) => item.children?.length)
    .map((item) => ({
      label: item.title,
      to: getFirstPagePath(item),
      active: route.path.startsWith(`${item.path}/`),
    })),
);
</script>

<template>
  <NuxtLink to="/" :aria-label="appConfig.header?.title">
    <AppHeaderLogo class="h-6 w-auto shrink-0" />
  </NuxtLink>

  <UNavigationMenu :items="sections" variant="link" class="ms-4 hidden lg:flex" />
</template>
