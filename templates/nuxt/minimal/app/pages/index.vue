<script setup lang="ts">
import { edit } from "tenoncms/preview";

// The newest posts come first.
const { data: posts } = await useTenon().find("posts");
const count = computed(() => posts.value?.length ?? 0);
const date = (value: string) =>
  new Date(value).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
useHead({ title: "Welcome to Tenon" });
</script>

<template>
  <main class="wrap">
    <section class="hero">
      <h1>Welcome to Tenon</h1>
      <p class="intro">
        This page reads the posts collection. Add a post in the admin, reload, and the count below
        goes up.
      </p>
      <div class="actions">
        <a class="button" href="/admin">Open the admin</a>
        <a href="https://tenoncms.com/docs">Read the docs</a>
      </div>
      <p class="hint">
        Edit <code class="chip">app/pages/index.vue</code> and save to see this page change.
      </p>
    </section>

    <section class="section">
      <div class="split">
        <div class="stack">
          <p class="count">{{ count }}</p>
          <p class="label">
            {{ count === 1 ? "Post" : "Posts" }} in the <code class="chip">posts</code> collection
          </p>
          <p class="muted">Read with <code>useTenon().find("posts")</code></p>
        </div>
        <ul v-if="posts?.length" class="rows posts">
          <li v-for="post in posts" :key="post.id">
            <NuxtLink :to="`/posts/${post.slug}`">
              <strong :data-cms="edit('posts', post.id, 'title')">{{ post.title }}</strong>
              <time class="date">{{ date(post.publishedAt ?? post.createdAt) }}</time>
            </NuxtLink>
          </li>
        </ul>
        <div v-else class="empty">
          <p class="label">No posts yet.</p>
          <p class="muted">Sign in, write the first one and reload this page.</p>
          <a href="/admin">Write a post</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="split">
        <div class="stack">
          <h2>Make it yours</h2>
          <p class="muted">Change these files. The page reloads on save.</p>
        </div>
        <ul class="rows">
          <li>
            <code class="chip">cms/collections/posts.ts</code>
            <span>
              The fields of a post: a title, an image and the text. Add one, and the admin shows it
              after a reload.
            </span>
          </li>
          <li>
            <code class="chip">app/pages/index.vue</code>
            <span>This page and how it reads the posts.</span>
          </li>
          <li>
            <code class="chip">app/pages/posts/[slug].vue</code>
            <span>The page of one post, with its image and text.</span>
          </li>
          <li>
            <code class="chip">tenon.config.ts</code>
            <span>The collections, the database, media and sign-in.</span>
          </li>
        </ul>
      </div>
    </section>
  </main>
</template>
