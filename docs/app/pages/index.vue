<script setup lang="ts">
const appConfig = useAppConfig();
const repo = useRepoUrl();

const title = "The monolithic headless CMS";
const description = appConfig.seo.description;

useSeo({ title, description, type: "website" });
// @ts-expect-error: index does not have an og image
defineOgImage("Docs", {
  title: formatOgTitle(title),
  description: formatOgDescription(title, description),
});

const highlights = [
  {
    title: "Works with your framework",
    description: "Starters and guides for Astro, Nuxt and TanStack Start. Or run it standalone.",
    chips: [
      { label: "Astro", icon: "i-simple-icons-astro", ui: { leadingIcon: "text-[#BC52EE]" } },
      { label: "Nuxt", icon: "i-simple-icons-nuxt", ui: { leadingIcon: "text-[#00DC82]" } },
      {
        label: "TanStack Start",
        icon: "i-simple-icons-tanstack",
        ui: { leadingIcon: "text-[#FF4154]" },
      },
      { label: "+ more to come", variant: "soft" as const },
    ],
  },
  {
    title: "Your preferred database",
    description: "Content lives in a relational database of your liking near your site or remote.",
    chips: [
      { label: "SQLite" },
      { label: "Turso" },
      { label: "Postgres" },
      { label: "PGlite" },
      { label: "Durable Objects" },
    ],
  },
  {
    title: "Deploy where you want",
    description: "The core is a Hono app, so it runs where your app runs.",
    chips: [
      { label: "Node", icon: "i-simple-icons-nodedotjs", ui: { leadingIcon: "text-[#5FA04E]" } },
      { label: "Vercel", icon: "i-simple-icons-vercel" },
      {
        label: "Cloudflare",
        icon: "i-simple-icons-cloudflare",
        ui: { leadingIcon: "text-[#F38020]" },
      },
    ],
  },
];

const project = [
  {
    title: "Free and open source",
    description: "Tenon is MIT licensed. Issues and pull requests are welcome.",
    links: [
      {
        label: "Contribute",
        to: `${repo}#contributing`,
        target: "_blank",
        icon: "i-simple-icons-github",
      },
    ],
  },
  {
    title: "See what's next!",
    description: "Tenon is in version 0.x. The roadmap shows what is done and what comes next.",
    links: [
      {
        label: "See the roadmap",
        to: `${repo}#roadmap`,
        target: "_blank",
        trailingIcon: "i-lucide-arrow-up-right",
      },
    ],
  },
];
</script>

<template>
  <div class="divide-default divide-y">
    <LandingHero />
    <LandingInstall class="frame-marks" />
    <LandingCards :cards="highlights" />
    <LandingWhy />
    <LandingFeatures class="frame-marks" />
    <LandingBatteries class="frame-marks" />
    <LandingGetStarted class="frame-marks" />
    <LandingCards :cards="project" class="lg:border-default lg:border-b" />
    <div aria-hidden class="hidden h-32 lg:block"></div>
  </div>
</template>
