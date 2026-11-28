<script setup lang="ts">
import { edit } from "tenoncms/preview";

const route = useRoute();
const { data: post, status } = await useTenon().findOne("posts", () => ({
  where: { slug: String(route.params.slug) },
}));
watchEffect(() => {
  if (status.value === "success" && !post.value)
    showError({ statusCode: 404, statusMessage: "Post not found", fatal: true });
});
const date = computed(
  () =>
    post.value &&
    new Date(post.value.publishedAt ?? post.value.createdAt).toLocaleDateString("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    }),
);
useHead({ title: () => post.value?.title ?? "" });
</script>

<template>
  <article v-if="post" class="wrap narrow">
    <header class="post-head">
      <NuxtLink class="back" to="/">← All posts</NuxtLink>
      <h1 :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</h1>
    </header>
    <TenonImage
      :image="post.image"
      class="post-image"
      sizes="(min-width: 768px) 688px, 100vw"
      loading="eager"
      fetchpriority="high"
      :data-cms="edit('posts', post.id, 'image')"
    />
    <div class="post-body">
      <div class="stack">
        <time class="date">{{ date }}</time>
        <p class="hint">
          Edit <code class="chip">app/pages/posts/[slug].vue</code> to change this page.
        </p>
      </div>
      <TenonRichtext
        :content="post.body"
        class="prose"
        :data-cms="edit('posts', post.id, 'body')"
      />
    </div>
  </article>
</template>
