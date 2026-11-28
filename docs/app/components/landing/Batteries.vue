<script setup lang="ts">
const batteries = [
  {
    icon: "i-lucide-git-branch",
    title: "Drafts and versions",
    description: "Drafts, scheduled publishing and a version history.",
    to: "/docs/core/working-with-content/reading#drafts",
  },
  {
    icon: "i-lucide-languages",
    title: "Localization",
    description: "Localized content and a localized admin, out of the box.",
    to: "/docs/core/working-with-content/localization",
  },
  {
    icon: "i-lucide-eye",
    title: "Live preview",
    description: "A visual editor and an admin bar on your own pages.",
    to: "/docs/core/building-your-site/live-preview",
  },
  {
    icon: "i-lucide-image",
    title: "Media",
    description: "A media library with image transformations.",
    to: "/docs/core/content-modeling/media",
  },
  {
    icon: "i-lucide-shield-check",
    title: "Users and access",
    description: "Roles, invites, access rules, API keys and edit locks.",
    to: "/docs/core/users-and-access/access-control",
  },
  {
    icon: "i-lucide-clock",
    title: "Jobs and webhooks",
    description: "Background jobs, cron schedules and webhooks.",
    to: "/docs/core/operations/jobs",
  },
  {
    icon: "i-lucide-mail",
    title: "Email",
    description: "SMTP email for invites, magic links and codes.",
    to: "/docs/core/operations/email",
  },
  {
    icon: "i-lucide-plug",
    title: "Plugins",
    description: "A plugin system, with presets for marketing pages.",
    to: "/docs/core/customization/plugins",
  },
  {
    icon: "i-lucide-search",
    title: "Easy to use presets",
    description: "Pages, SEO fields, sitemap, robots and menus.",
    to: "/docs/core/building-your-site/pages-and-seo",
  },
];
</script>

<template>
  <section class="divide-default divide-y">
    <div
      class="mx-auto w-full max-w-(--ui-container) px-4 pt-32 pb-16 sm:px-6 lg:grid lg:px-8 lg:pt-48 lg:pb-24"
    >
      <h2 class="mb-2 text-4xl lg:text-5xl">Batteries Included</h2>
      <p class="text-muted max-w-3xl lg:text-lg">
        This is not a complete list of features, but the most important key features are already
        built in. More information about each topic in the docs.
      </p>
    </div>

    <!-- The gap shows the background as hairlines between the cards. -->
    <ul class="bg-border grid gap-px lg:grid-cols-3">
      <li v-for="item in batteries" :key="item.title" class="flex">
        <UPageCard
          variant="ghost"
          :to="item.to"
          :icon="item.icon"
          :title="item.title"
          :description="item.description"
          class="group bg-default hover:bg-elevated/50 flex-1 rounded-none"
          :ui="{
            container: 'px-6 py-8 sm:p-8',
            leading:
              'mb-6 size-10 justify-center rounded-md border border-default bg-elevated/50 transition-colors group-hover:border-primary/40',
            leadingIcon: 'size-5 text-primary',
          }"
        >
          <template #title>
            <span class="flex items-center gap-2">
              {{ item.title }}
              <UIcon
                name="i-lucide-arrow-right"
                class="text-muted size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
              />
            </span>
          </template>
        </UPageCard>
      </li>
    </ul>
  </section>
</template>
