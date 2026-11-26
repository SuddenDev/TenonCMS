<script setup lang="ts">
import type { ContentNavigationLink } from "#ui/types";

// The header menu passes one section. Without a prop the sidebar shows the current section.
const props = defineProps<{ navigation?: ContentNavigationLink[] }>();

const { sidebarNavigation } = useSubNavigation();
const route = useRoute();

const contentNavVariants = useUIConfig("contentNavigation");

// Section headings stay open. Folders below them, like Fields, start closed unless they hold the current page.
const navigation = computed<ContentNavigationLink[] | undefined>(() =>
  (props.navigation ?? sidebarNavigation.value)?.map((section) => ({
    ...section,
    disabled: true,
    children: section.children?.map(markFolders),
  })),
);

function markFolders(link: ContentNavigationLink): ContentNavigationLink {
  if (!link.children?.length) return link;
  return {
    ...link,
    // `active: false` gives the folder the muted and hover styles of a page link.
    active: false,
    defaultOpen: holdsPath(link, route.path),
    ui: { trigger: "cursor-pointer font-normal", content: "ps-4", linkTrailing: "inline-flex" },
    children: link.children.map(markFolders),
  };
}

function holdsPath(link: ContentNavigationLink, path: string): boolean {
  return link.path === path || !!link.children?.some((child) => holdsPath(child, path));
}
</script>

<template>
  <!-- Only folders show a caret. -->
  <UContentNavigation
    :highlight="contentNavVariants.highlight ?? true"
    :highlight-color="contentNavVariants.highlightColor"
    :variant="contentNavVariants.variant ?? 'link'"
    :color="contentNavVariants.color"
    :navigation="navigation"
    :ui="{
      linkTrailing: 'hidden',
      linkTrailingIcon: 'size-3.5 pr-12 group-data-[state=open]:rotate-90',
    }"
    trailing-icon="i-lucide-chevron-right"
  />
</template>
