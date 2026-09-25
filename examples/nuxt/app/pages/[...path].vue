<script setup lang="ts">
import { seoMeta } from 'integral-cms/presets'

// `index.vue` and `posts/[slug].vue` win over this route, so a CMS page at `/` never shows.
const route = useRoute()
const path = `/${[route.params.path ?? []].flat().join('/')}`
const { data: page } = await useIntegral().findOne('pages', { where: { path }, populate: false })
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const meta = seoMeta(page.value)
useSeoMeta({ title: meta.title, description: meta.description, robots: meta.noindex ? 'noindex' : undefined })
</script>

<template>
  <main v-if="page">
    <NuxtLink to="/">← Home</NuxtLink>
    <h1>{{ page.title }}</h1>
    <p style="white-space: pre-wrap">{{ page.body }}</p>
  </main>
</template>
