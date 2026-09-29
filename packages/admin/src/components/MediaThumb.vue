<script setup lang="ts">
import { fileIcon, type MediaRead } from "../api";
import Icon from "./Icon.vue";

defineProps<{ doc?: MediaRead | null; sizes: string }>();
</script>

<template>
  <img
    v-if="doc?.mimeType.startsWith('image/')"
    :src="doc.src ?? doc.url"
    :srcset="doc.srcset || undefined"
    :sizes
    :alt="doc.alt ?? ''"
    loading="lazy"
    class="rounded bg-zinc-100 object-cover"
  />
  <span v-else class="flex items-center justify-center rounded bg-zinc-100">
    <Icon :name="fileIcon(doc?.mimeType ?? '')" />
  </span>
</template>
