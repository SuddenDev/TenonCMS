<script setup lang="ts">
const commands = [
  { label: "npm", lang: "bash", code: "npm create tenoncms@latest" },
  { label: "pnpm", lang: "bash", code: "pnpm create tenoncms" },
  { label: "yarn", lang: "bash", code: "yarn create tenoncms" },
  { label: "bun", lang: "bash", code: "bun create tenoncms" },
];
</script>

<template>
  <section class="divide-default grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
    <UPageCard
      variant="ghost"
      :ui="{
        body: 'w-full',
        container: 'lg:items-center',
      }"
    >
      <template #body>
        <div class="w-full">
          <h2 class="mb-4 text-3xl font-medium">Create a project</h2>
          <div class="text-muted mb-9">
            Follow the wizard: pick your framework, database and media storage.
            <br />Then open <ProseCode>/admin</ProseCode> and create the first admin account.
          </div>
          <div class="w-full space-y-4">
            <LandingCode :blocks="commands" />
            <p class="text-muted -mt-1 text-xs italic">Needs Node 24 or newer.</p>
          </div>
        </div>
      </template>
    </UPageCard>

    <div class="bg-muted flex min-w-0 flex-col justify-center px-6 py-12 sm:px-10 sm:py-20">
      <LandingTerminal />
    </div>
  </section>
</template>
