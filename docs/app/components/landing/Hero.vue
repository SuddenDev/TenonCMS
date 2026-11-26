<script setup lang="ts">
const links = [
  {
    label: "Get started",
    to: "/docs/core/getting-started/introduction",
    color: "neutral" as const,
  },
  {
    label: "Star on GitHub",
    to: useRepoUrl(),
    target: "_blank",
    icon: "i-simple-icons-github",
    color: "neutral" as const,
    variant: "outline" as const,
  },
];
</script>

<template>
  <UPageHero
    :links="links"
    :ui="{
      container:
        'gap-14 px-0 pt-20 pb-0 sm:gap-y-20 sm:px-0 sm:pt-24 sm:pb-0 lg:px-0 lg:pt-24 lg:pb-0',
      wrapper: 'px-4 lg:px-6 text-left',
      footer: 'mt-6 lg:mt-8',
      links: 'gap-x-3 justify-start',
    }"
  >
    <template #body>
      <h1 class="mb-4 text-5xl font-medium lg:mb-6 lg:text-7xl">
        The monolythic headless CMS.
        <!-- A CMS integrated into your app. -->
      </h1>
      <p class="text-muted max-w-3xl lg:text-lg">
        Move the admin, the API and content into the app you already deploy and write your schema in
        TypeScript. Data stores in SQLite, Postgres or a Cloudflare Durable Object and runs on Node,
        Vercel or Cloudflare. Free and MIT licensed.
      </p>
    </template>

    <LandingImageBg
      src="/images/smithsonian-oUvoYlq2J_s-unsplash.jpg"
      class="relative px-2 py-12 sm:px-10 sm:py-20"
    >
      <LandingHeroImage class="relative z-5 mx-auto max-w-6xl" />
    </LandingImageBg>
  </UPageHero>
</template>
