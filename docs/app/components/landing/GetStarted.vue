<script setup lang="ts">
const repo = useRepoUrl();

const command = { lang: "bash", code: "npm create tenoncms@latest" };
</script>

<template>
  <section>
    <!-- The full-width background clips its own box, so the frame marks need this outer element. -->
    <div class="dark px-4 py-16 sm:px-10 sm:py-24">
      <div class="bg-default text-default grid gap-2 rounded-lg p-2 lg:grid-cols-2">
        <div class="flex flex-col p-4 sm:p-6">
          <p class="text-muted font-mono text-xs tracking-widest uppercase">Get started</p>
          <h2 class="text-highlighted mt-10 text-3xl font-medium lg:text-4xl">
            Try it in your own project
          </h2>
          <p class="text-muted mt-3 text-lg">
            Run the wizard, pick your framework and database, then open /admin. Or read the docs
            first.
          </p>
          <div class="mt-10 flex flex-wrap items-center gap-4 lg:mt-auto lg:pt-10">
            <UButton
              label="Read the docs"
              to="/docs/core/getting-started/introduction"
              color="neutral"
              size="lg"
              class="rounded-full px-4"
            />
            <UButton
              label="Star on GitHub"
              :to="repo"
              target="_blank"
              color="neutral"
              variant="link"
              trailing-icon="i-lucide-arrow-up-right"
            />
          </div>
        </div>

        <LandingImageBg
          src="/images/smithsonian-oUvoYlq2J_s-unsplash.jpg"
          class="flex min-h-64 items-center overflow-hidden rounded-md px-4 py-12"
        >
          <LandingCode
            :blocks="[command]"
            class="dark mx-auto w-fit max-w-full shadow-2xl [&_pre]:pr-12"
          />
        </LandingImageBg>
      </div>
    </div>
  </section>
</template>
