<script setup lang="ts">
const props = defineProps<{ href?: string; target?: string }>();

const isExternal = computed(() => /^(https?:)?\/\//.test(props.href ?? ""));

// The classes of the Nuxt UI prose link, so a link that holds `code` keeps its own hover style.
const base = [
  "text-primary border-b border-transparent hover:border-primary focus-visible:border-transparent font-medium focus-visible:rounded-xs outline-primary/25 focus-visible:outline-3 focus-visible:has-[>code]:outline-0 has-[>code]:border-b-0 [&>code]:border-dashed [&>code]:outline-primary/25 focus-visible:[&>code]:outline-3 hover:[&>code]:border-primary hover:[&>code]:text-primary focus-visible:[&>code]:border-primary focus-visible:[&>code]:text-primary",
  "transition-colors [&>code]:transition-colors",
];
</script>

<template>
  <ULink :href="href" :target="isExternal ? '_blank' : target" raw :class="base">
    <slot /><UIcon
      v-if="isExternal"
      name="i-lucide-arrow-up-right"
      class="ms-0.5 size-3.5 align-text-top"
    />
  </ULink>
</template>
