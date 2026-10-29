<script setup lang="ts">
import { seoMeta } from "tenoncms/client";
import { edit } from "tenoncms/preview";

// `index.vue` and `[[locale]]/posts/[slug].vue` win over this route, so a CMS page at `/` never shows.
// `path` is the route's path without the locale prefix; `useTenon()` reads in the route's locale.
const { path } = useLocale();
const cms = useTenon();
const {
  data: page,
  status,
  error,
} = await cms.findOne(
  "pages",
  () =>
    ({
      where: { path: path.value },
      alternates: true,
      populate: { seo: { image: true } },
    }) as const,
);
useAlternates(() => (status.value === "success" ? page.value?.alternates : null));
watchEffect(() => {
  if (error.value) showError(error.value);
  else if (status.value === "success" && !page.value)
    showError({ statusCode: 404, statusMessage: "Page not found", fatal: true });
});

const [{ data: general }, { data: seo }] = await Promise.all([
  cms.getGlobal("general"),
  cms.getGlobal("seo"),
]);
const meta = computed(() => seoMeta(page.value ?? {}, { general: general.value, seo: seo.value }));
useSeoMeta({
  title: () => meta.value.title,
  description: () => meta.value.description,
  robots: () => (meta.value.noindex ? "noindex" : undefined),
  ogImage: () => meta.value.image,
});
useHead(() => ({
  link: [
    ...(meta.value.canonical ? [{ rel: "canonical" as const, href: meta.value.canonical }] : []),
    ...meta.value.alternates.map((a) => ({
      rel: "alternate" as const,
      hreflang: a.hreflang,
      href: a.href,
    })),
  ],
  meta: meta.value.verification,
}));
</script>

<template>
  <AppHeader />
  <main v-if="page">
    <h1 :data-cms="edit('pages', page.id, 'title')">{{ page.title }}</h1>
    <p :data-cms="edit('pages', page.id, 'body')" style="white-space: pre-wrap">{{ page.body }}</p>
  </main>
</template>
