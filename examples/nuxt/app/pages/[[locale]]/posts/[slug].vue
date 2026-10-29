<script setup lang="ts">
import { edit } from "tenoncms/preview";
import { seoMeta } from "tenoncms/client";

// `[[locale]]` is empty for the default locale (`/posts/x`) and the locale code otherwise (`/de/posts/x`).
// `path` drops a valid prefix only, so `/xx/posts/x` keeps it and is a 404.
const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { path } = useLocale();
const cms = useTenon();
const {
  data: post,
  status,
  error,
} = await cms.findOne(
  "posts",
  () =>
    ({
      where: { slug: slug.value },
      alternates: true,
      populate: true,
      depth: 1,
    }) as const,
);
useAlternates(() => (status.value === "success" ? post.value?.alternates : null));
watchEffect(() => {
  if (error.value) showError(error.value);
  else if (status.value === "success" && (!post.value || path.value !== `/posts/${slug.value}`))
    showError({ statusCode: 404, statusMessage: "Post not found", fatal: true });
});

const { data: general } = await cms.getGlobal("general");
const meta = computed(() => seoMeta(post.value ?? {}, { general: general.value }));
useHead(() => ({
  title: post.value?.title,
  link: [
    ...(meta.value.canonical ? [{ rel: "canonical" as const, href: meta.value.canonical }] : []),
    ...meta.value.alternates.map((a) => ({
      rel: "alternate" as const,
      hreflang: a.hreflang,
      href: a.href,
    })),
  ],
}));
</script>

<template>
  <AppHeader />
  <main v-if="post">
    <h1 :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</h1>
    <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ post.publishedAt }}</time>
    <img
      v-if="post.hero"
      :src="post.hero.src"
      :srcset="post.hero.srcset"
      sizes="(min-width: 720px) 720px, 100vw"
      :width="post.hero.width"
      :height="post.hero.height"
      :alt="post.hero.alt ?? ''"
      style="max-width: 100%; height: auto"
    />
    <p :data-cms="edit('posts', post.id, 'body')" style="white-space: pre-wrap">{{ post.body }}</p>
    <div class="json">
      <pre>{{ post }}</pre>
    </div>
  </main>
</template>
<style>
.json {
  background-color: #f5f5f5;
  border-radius: 0.25rem;
  padding: 0.25rem 1rem;
  display: flex;
}
</style>
