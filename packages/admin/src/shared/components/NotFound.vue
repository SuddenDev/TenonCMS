<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { CONTENT } from "@/shared/options";

useHead({ title: "Not found" });
</script>

<template>
  <h1 class="text-2xl font-semibold">Page not found</h1>
  <p class="text-muted-foreground mt-2 text-sm">
    This page does not exist.
    <RouterLink :to="CONTENT" class="underline">Back to content</RouterLink>
  </p>
</template>
