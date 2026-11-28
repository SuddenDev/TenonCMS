<script setup lang="ts">
defineProps<{
  /** File name in `public/images/fields/` without `-light.png` or `-dark.png`. */
  name: string;
  alt?: string;
}>();
</script>

<template>
  <figure class="border-default bg-muted my-5 flex justify-center rounded-md border p-6">
    <img
      :src="`/images/fields/${name}-light.png`"
      :alt="alt ?? `The ${name} field in the admin`"
      loading="lazy"
      class="border-accented w-full rounded-sm border [html.dark_&]:hidden"
    />
    <img
      :src="`/images/fields/${name}-dark.png`"
      :alt="alt ?? `The ${name} field in the admin`"
      loading="lazy"
      class="border-accented/50 hidden w-full rounded-sm border [html.dark_&]:block"
    />
  </figure>
</template>
