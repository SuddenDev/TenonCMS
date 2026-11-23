<script setup lang="ts">
const blocks = [
  {
    id: "schema",
    label: "Schema",
    icon: "i-lucide-braces",
    // image: "/images/art-institute-of-chicago-ONe3eufNvz4-unsplash.jpg",
    title: "Your schema is plain TypeScript",
    description:
      "Collections and globals are plain TypeScript in your repo. Their types flow into your pages.",
    points: [
      "Collections, globals, relations, lists and blocks",
      "Validation, conditions and hooks",
      "Types inferred from the schema",
    ],
    code: {
      label: "cms/collections/posts.ts",
      code: `import { defineCollection } from "tenoncms";

export const posts = defineCollection({
  titleField: "title",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", unique: true },
    body: { type: "richtext" },
  },
});`,
    },
  },
  {
    id: "local-api",
    label: "Local API",
    icon: "i-lucide-zap",
    // image: "/images/art-institute-of-chicago-aA_j18OXe4Y-unsplash.jpg",
    title: "Read content without HTTP",
    description:
      "Server code calls the CMS directly. The HTTP API is a thin layer over the same functions.",
    points: [
      "Results typed from the schema",
      "The same validation and access rules everywhere",
      "One browser client for everything else",
    ],
    code: {
      code: `const [post] = await cms.find("posts", {
  where: { slug: "hello" },
  limit: 1,
});`,
    },
  },
  {
    id: "config",
    label: "Config",
    icon: "i-lucide-settings-2",
    // image: "/images/europeana-F8TZ_99yZdc-unsplash.jpg",
    title: "One config file",
    description:
      "Database, media, email and sign-in are easy to configure in one file. The admin and the API become routes of your app.",
    points: [
      "SQLite or Turso, Postgres, PGlite or a Durable Object",
      "Media on local disk, S3 or R2",
      "Password, passkey, magic link or email code",
    ],
    code: {
      label: "tenon.config.ts",
      code: `import { DATABASE_URL, TENON_SECRET } from "astro:env/server";
import { defineCms } from "tenoncms";
import { libsql } from "tenoncms/libsql";
import { posts } from "./cms/collections/posts";

export default defineCms({
  collections: { posts },
  database: libsql(DATABASE_URL),
  secret: TENON_SECRET,
  site: { name: "My site" },
});`,
    },
  },
  {
    id: "cli",
    label: "CLI",
    icon: "i-lucide-terminal",
    // image: "/images/henrik-donnestad-HO1Evlp1p1o-unsplash.jpg",
    title: "Mangage your CMS through the CLI",
    description:
      "The tenon command comes with the package. It backs up a project, restores it, upgrades it and manages its users.",
    points: [
      "Full backups: content, versions, media and users",
      "Invite or recover users from the terminal",
      "A flag for every question, for scripts and CI",
    ],
    code: {
      lang: "bash",
      code: `npx tenon backup
npx tenon restore tenon-my-site-2026-11-12-1530.zip
npx tenon users create editor@example.com
npx tenon media regenerate`,
    },
  },
];

const active = ref(blocks[0]!.id);
let observer: IntersectionObserver | undefined;

onMounted(() => {
  // A block is active while it crosses the middle of the viewport.
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) active.value = entry.target.id;
      }
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );

  for (const { id } of blocks) observer.observe(document.getElementById(id)!);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section>
    <!-- The full-width background clips its own box, so the frame marks need this outer element. -->
    <div
      class="dark dark-deep full-bleed divide-default border-default bg-default text-default -mx-px divide-y border-x"
    >
      <UPageSection
        title="Everything a CMS needs, built in"
        description="Schema, API, admin, media and auth ship in one package."
        :ui="{
          title: 'text-4xl lg:text-6xl text-left',
          description: 'text-left lg:text-lg mt-2 lg:mt-4',
          container: 'pt-28 lg:pt-56 lg:pb-24',
        }"
      />

      <!-- The nav sticks for as long as this wrapper is on screen. -->
      <div>
        <nav
          aria-label="Features"
          class="border-default sticky top-(--ui-header-height) z-10 grid grid-cols-4 gap-px border-b bg-(--ui-border)"
        >
          <UButton
            v-for="block in blocks"
            :key="block.id"
            :to="`#${block.id}`"
            :label="block.label"
            :icon="block.icon"
            :aria-current="active === block.id ? 'true' : undefined"
            color="neutral"
            variant="ghost"
            block
            class="bg-default rounded-none border-b-2 py-4 font-mono"
            :class="
              active === block.id
                ? 'border-primary text-highlighted'
                : 'text-muted border-transparent'
            "
            :ui="{ leadingIcon: 'hidden sm:block' }"
          />
        </nav>

        <div
          v-for="block in blocks"
          :id="block.id"
          :key="block.id"
          class="divide-default border-default grid scroll-mt-[calc(var(--ui-header-height)+3.5rem)] divide-y border-b last:border-b-0 lg:grid-cols-2 lg:divide-x lg:divide-y-0"
        >
          <UPageCard
            variant="ghost"
            :title="block.title"
            :description="block.description"
            :ui="{
              title: 'text-3xl',
              body: 'flex-0',
              footer: 'mt-0',
              wrapper: 'lg:justify-center',
              container: 'lg:min-h-112',
            }"
          >
            <template #header>
              <p class="text-muted font-mono text-xs tracking-widest uppercase">
                {{ block.label }}
              </p>
            </template>

            <template #footer>
              <ul class="space-y-3">
                <li v-for="point in block.points" :key="point" class="flex items-center gap-3">
                  <UIcon name="i-lucide-circle-check" class="text-muted size-4 shrink-0" />
                  {{ point }}
                </li>
              </ul>
            </template>
          </UPageCard>

          <LandingImageBg class="flex min-w-0 flex-col justify-center px-6 py-12 sm:px-10 sm:py-16">
            <LandingCode :blocks="[block.code]" class="shadow-2xl" />
          </LandingImageBg>
        </div>
      </div>
    </div>
  </section>
</template>
