<script setup lang="ts">
const gains = [
  "One repo, one deploy, one database",
  "Server code reads content without HTTP",
  "Types flow from the schema into your pages",
];

const stack = [
  { name: "Hono", icon: "i-simple-icons-hono", role: "Simple, easy to use and integrate" },
  { name: "Vite", icon: "i-simple-icons-vite", role: "Bundles with your app" },
  { name: "Kysely", icon: "i-lucide-database", role: "SQL on every supported database" },
  { name: "better-auth", icon: "i-lucide-key-round", role: "Trusted and easy to extend" },
  { name: "Zod", icon: "i-simple-icons-zod", role: "Validation from the schema" },
  { name: "Vue", icon: "i-simple-icons-vuedotjs", role: "Fast and extensible Admin UI" },
];
</script>

<template>
  <section class="divide-default grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
    <UPageCard variant="ghost" title="One app instead of two">
      <template #description>
        <div class="">
          <p class="text-muted mb-6">
            Headless CMSs work with any framework because they talk REST or GraphQL. The price is a
            second service with its own deployment and database server. Tenon takes the other route:
            the admin and the API are routes in your app.
          </p>
          <ul class="text-muted space-y-2">
            <li v-for="gain in gains" :key="gain" class="flex items-center gap-3">
              <span class="bg-primary size-1.5 rounded-full" />
              {{ gain }}
            </li>
          </ul>
        </div>
      </template>
    </UPageCard>

    <UPageCard
      variant="ghost"
      title="A stack you already know and trust"
      description="Built on web standards and on libraries you may already use."
      :ui="{ footer: 'w-full' }"
    >
      <template #footer>
        <dl class="divide-default border-default divide-y border-y">
          <div
            v-for="item in stack"
            :key="item.name"
            class="grid grid-cols-[10rem_1fr] items-center py-3"
          >
            <dt class="text-highlighted flex items-center gap-2.5 font-medium">
              <UIcon :name="item.icon" class="text-muted size-4" />
              {{ item.name }}
            </dt>
            <dd class="text-muted">
              {{ item.role }}
            </dd>
          </div>
        </dl>
      </template>
    </UPageCard>
  </section>
</template>
