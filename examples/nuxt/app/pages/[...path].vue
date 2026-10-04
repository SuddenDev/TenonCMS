<script setup lang="ts">
import { seoMeta } from "integral-cms/client";
import { edit } from "integral-cms/preview";

// `index.vue` and `posts/[slug].vue` win over this route, so a CMS page at `/` never shows.
const route = useRoute();
const path = `/${[route.params.path ?? []].flat().join("/")}`;
const cms = useIntegral();
const { data: page } = await cms.findOne("pages", {
  where: { path },
  populate: { seo: { image: true } },
});
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
  link: meta.canonical ? [{ rel: "canonical", href: meta.canonical }] : [],
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
