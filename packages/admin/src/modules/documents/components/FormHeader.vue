<script setup lang="ts">
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";

// `to`: where the back button goes. The default slot holds the actions on the right.
defineProps<{ to: string; title: string; description?: string }>();
</script>

<template>
  <header class="mb-6 flex max-w-3xl items-start gap-3">
    <Button as-child variant="ghost" size="icon" aria-label="Back">
      <RouterLink :to="to"><Icon name="arrow-left" /></RouterLink>
    </Button>
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
    </div>
    <slot />
  </header>
</template>
