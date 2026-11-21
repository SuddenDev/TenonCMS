<script setup lang="ts">
defineProps<{
  src?: string;
  alt?: string;
}>();
</script>

<template>
  <div class="relative">
    <NuxtImg
      v-if="src"
      :src
      :alt
      format="webp"
      aria-hidden
      class="absolute inset-0 z-1 h-full w-full object-cover"
    />
    <div class="relative z-5 w-full"><slot /></div>
  </div>
</template>
