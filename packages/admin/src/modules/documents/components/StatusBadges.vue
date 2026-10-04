<script setup lang="ts">
// "Published" once the document has a published version, "Draft" while it has unpublished changes or was never published.
defineProps<{ doc: Record<string, unknown> }>();
</script>

<template>
  <div class="mt-2 flex gap-3 text-xs">
    <span v-if="doc.publishedAt" class="text-muted-foreground flex items-center gap-1.5">
      <span class="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
      Published
    </span>
    <span
      v-if="doc.hasDraft || doc.publishedAt === null"
      class="text-muted-foreground flex items-center gap-1.5"
    >
      <span class="size-2 rounded-full bg-amber-500" aria-hidden="true" />
      Draft
    </span>
  </div>
</template>
