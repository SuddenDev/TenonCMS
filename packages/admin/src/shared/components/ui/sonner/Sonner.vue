<script setup lang="ts">
import { Toaster as Sonner, type ToasterProps } from "vue-sonner";
import { useTheme } from "@/shared/composables/useTheme";
import { Spinner } from "@/shared/components/ui/spinner";

const props = withDefaults(defineProps<ToasterProps>(), {
  position: "top-center",
  richColors: true,
});
const theme = useTheme();
</script>

<template>
  <Sonner
    v-bind="props"
    :theme="props.theme ?? (theme === 'auto' ? 'system' : theme)"
    :style="{
      fontFamily: 'var(--font-sans)',
      pointerEvents: 'auto',
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
      ...props.style,
    }"
  >
    <template #loading-icon><Spinner /></template>
  </Sonner>
</template>
