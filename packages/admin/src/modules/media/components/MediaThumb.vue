<script setup lang="ts">
import type { MediaRead } from "@/shared/api";
import { fileIcon } from "@/modules/media/media";
import Icon from "@/shared/components/Icon.vue";

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
    class="bg-muted rounded object-cover"
  />
  <span v-else class="bg-muted flex items-center justify-center rounded">
    <Icon :name="fileIcon(doc?.mimeType ?? '')" />
  </span>
</template>
