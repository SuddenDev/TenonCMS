<script setup lang="ts">
import type { ContentNavigationLink } from "#ui/types";

const route = useRoute();
const navigation = inject<Ref<ContentNavigationLink[]>>("navigation");

const sections = computed(() => (navigation?.value ?? []).filter((item) => item.children?.length));
</script>

<!-- The mobile menu: one collapsible block per section. The current section starts open. -->
<template>
  <UCollapsible
    v-for="section in sections"
    :key="section.path"
    :default-open="route.path.startsWith(`${section.path}/`)"
    class="mb-4"
  >
    <template #default="{ open }">
      <button
        type="button"
        class="text-highlighted flex w-full cursor-pointer items-center justify-between py-1.5 text-sm font-semibold"
      >
        {{ section.title }}
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 transition-transform"
          :class="{ 'rotate-90': open }"
        />
      </button>
    </template>

    <template #content>
      <DocsAsideLeftBody :navigation="section.children" class="ps-2 pt-3" />
    </template>
  </UCollapsible>
</template>
