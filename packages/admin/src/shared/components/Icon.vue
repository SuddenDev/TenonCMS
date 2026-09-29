<script setup lang="ts">
import { type Component, defineAsyncComponent } from "vue";

const props = defineProps<{ name: string }>();

// ponytail: one lazy chunk with every Lucide icon, loaded on first use. Split per icon if its size matters.
const lucide = () => import("@lucide/vue") as unknown as Promise<Record<string, Component>>;
const pascal = (name: string) => name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
const icon = defineAsyncComponent(async () => {
  const icons = await lucide();
  return icons[pascal(props.name)] ?? icons.CircleHelp;
});
</script>

<template>
  <component :is="icon" class="size-4 shrink-0" />
</template>
