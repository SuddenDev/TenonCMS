<script lang="ts" setup>
/**
 * Replaces the Docs template of Docus. The landing page uses it too, without a headline.
 * Classes MUST be static: the renderer resolves them at build time.
 */
const {
  title = "Tenon CMS",
  description = "",
  headline = "",
} = defineProps<{ title?: string; description?: string; headline?: string }>();
</script>

<template>
  <div class="relative flex h-full w-full flex-col justify-between bg-black px-[72px] py-[64px]">
    <img src="/images/og-background.jpg" class="absolute inset-0 h-full w-full object-cover" />
    <div
      class="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,10,9,0.97)_0%,rgba(12,10,9,0.5)_60%,rgba(12,10,9,0.05)_100%)]"
    />

    <img src="/logo/tenon-logo-dark.svg" width="234" height="36" class="relative" />

    <div class="relative flex flex-col">
      <p
        v-if="headline"
        class="m-0 mb-5 text-[22px] font-bold tracking-[0.12em] text-orange-400 uppercase"
      >
        {{ headline }}
      </p>
      <h1 class="m-0 mb-6 max-w-[900px] text-[64px] leading-[1.05] font-bold text-stone-50">
        {{ title }}
      </h1>
      <p v-if="description" class="m-0 max-w-[820px] text-[28px] leading-[1.35] text-stone-300">
        {{ description }}
      </p>
    </div>

    <p class="relative m-0 text-[20px] text-stone-400">tenoncms.com</p>
  </div>
</template>
