<script setup lang="ts">
import { seoMeta } from "integral-cms/client";
import { edit } from "integral-cms/preview";

// `index.vue` and `[[locale]]/posts/[slug].vue` win over this route, so a CMS page at `/` never shows.
// `path` is the route's path without the locale prefix; `useIntegral()` reads in the route's locale.
const { path } = useLocale();
const cms = useIntegral();
const { data: page } = await cms.findOne("pages", {
  where: { path: path.value },
  alternates: true,
  populate: { seo: { image: true } },
});
useAlternates(() => page.value?.alternates);
if (!page.value)
  throw createError({ statusCode: 404, statusMessage: "Page not found", fatal: true });

const [{ data: general }, { data: seo }] = await Promise.all([
  cms.getGlobal("general"),
  cms.getGlobal("seo"),
]);
const meta = seoMeta(page.value, { general: general.value, seo: seo.value });
useSeoMeta({
  title: meta.title,
  description: meta.description,
  robots: meta.noindex ? "noindex" : undefined,
  ogImage: meta.image,
});
useHead({
  link: [
    ...(meta.canonical ? [{ rel: "canonical" as const, href: meta.canonical }] : []),
    ...meta.alternates.map((a) => ({
      rel: "alternate" as const,
      hreflang: a.hreflang,
      href: a.href,
    })),
  ],
  meta: meta.verification,
});
</script>

<template>
  <main v-if="page">
    <NuxtLink to="/">← Home</NuxtLink>
    <h1 :data-cms="edit('pages', page.id, 'title')">{{ page.title }}</h1>
    <p :data-cms="edit('pages', page.id, 'body')" style="white-space: pre-wrap">{{ page.body }}</p>
  </main>
</template>
