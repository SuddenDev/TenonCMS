<script setup lang="ts">
const repo = useRepoUrl();

const columns = [
  {
    label: "Get started",
    children: [
      { label: "Introduction", to: "/docs/core/getting-started/introduction" },
      { label: "Quick start", to: "/docs/core/getting-started/quick-start" },
      { label: "Configuration", to: "/docs/core/getting-started/configuration" },
      { label: "How Tenon works", to: "/docs/core/getting-started/how-tenon-works" },
    ],
  },
  {
    label: "Frameworks",
    children: [
      { label: "Astro", to: "/docs/guide/frameworks/astro" },
      { label: "Nuxt", to: "/docs/guide/frameworks/nuxt" },
      { label: "TanStack Start", to: "/docs/guide/frameworks/tanstack-start" },
      { label: "Standalone", to: "/docs/guide/frameworks/standalone" },
    ],
  },
  {
    label: "Guides",
    children: [
      { label: "Deployment", to: "/docs/guide/deployment" },
      { label: "Databases", to: "/docs/guide/databases-and-storage/databases" },
      { label: "CLI", to: "/docs/cli/overview" },
      { label: "Troubleshooting", to: "/docs/guide/recipes/troubleshooting" },
    ],
  },
  {
    label: "Project",
    children: [
      { label: "GitHub", to: repo, target: "_blank" },
      { label: "Releases", to: `${repo}/releases`, target: "_blank" },
      { label: "Roadmap", to: `${repo}#roadmap`, target: "_blank" },
      { label: "npm", to: "https://www.npmjs.com/package/tenoncms", target: "_blank" },
    ],
  },
];
</script>

<template>
  <div class="frame-marks mx-auto max-w-(--ui-container)">
    <!-- The full-width background clips its own box, so the frame marks need this outer element. -->
    <UFooter
      class="dark full-bleed border-default bg-default text-default border-x border-t"
      :ui="{ top: 'border-b border-default py-12 lg:py-16' }"
    >
      <template #top>
        <UContainer>
          <UFooterColumns
            :columns="columns"
            :ui="{ label: 'font-mono text-xs font-normal tracking-widest text-muted uppercase' }"
          >
            <template #left>
              <NuxtLink to="/" class="inline-flex">
                <img src="/logo/tenon-logo-dark.svg" alt="Tenon CMS" class="h-5 w-auto" />
              </NuxtLink>
              <p class="text-muted mt-4 max-w-xs text-sm">The monolithic headless CMS.</p>
            </template>
          </UFooterColumns>
        </UContainer>
      </template>

      <template #left>
        <p class="text-muted text-sm">
          © {{ new Date().getFullYear() }} Tenon CMS contributors. MIT licensed.
        </p>
      </template>

      <template #right>
        <AppFooterRight />
      </template>
    </UFooter>
  </div>
</template>
