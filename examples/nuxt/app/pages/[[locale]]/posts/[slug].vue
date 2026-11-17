<script setup lang="ts">
import { edit } from "tenoncms/preview";

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
watchEffect(() => {
  if (error.value) showError(error.value);
  else if (status.value === "success" && (!post.value || path.value !== `/posts/${slug.value}`))
    showError({ statusCode: 404, statusMessage: "Post not found", fatal: true });
});

// Title, canonical and `hreflang` links, absolute against `site.url`. It also registers the alternates.
await useTenonSeo(() => (status.value === "success" ? post.value : null));
</script>

<template>
  <AppHeader />
  <main v-if="post">
    <h1 :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</h1>
    <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ post.publishedAt }}</time>
    <TenonImage
      :image="post.hero"
      sizes="(min-width: 720px) 720px, 100vw"
      loading="eager"
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
