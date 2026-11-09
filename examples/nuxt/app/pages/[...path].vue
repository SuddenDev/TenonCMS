<script setup lang="ts">
import { edit } from "tenoncms/preview";
import TextBlock from "~/components/TextBlock.vue";

// `index.vue` and `[[locale]]/posts/[slug].vue` win over this route, so a CMS page at `/` never shows.
// `path` is the route's path without the locale prefix; `useTenon()` reads in the route's locale.
const { path } = useLocale();
const {
  data: page,
  status,
  error,
} = await useTenon().findOne(
  "pages",
  () =>
    ({
      where: { path: path.value },
      alternates: true,
      populate: { seo: { image: true } },
    }) as const,
);
watchEffect(() => {
  if (error.value) showError(error.value);
  else if (status.value === "success" && !page.value)
    showError({ statusCode: 404, statusMessage: "Page not found", fatal: true });
});

// Title, description, Open Graph, canonical, hreflang links, and the alternates for the locale switch.
await useTenonSeo(page);
</script>

<template>
  <AppHeader />
  <main v-if="page">
    <h1 :data-cms="edit('pages', page.id, 'title')">{{ page.title }}</h1>
    <TenonBlocks
      :blocks="page.content"
      :components="{ text: TextBlock }"
      :edit="{ collection: 'pages', id: page.id, path: 'content' }"
    />
  </main>
</template>
