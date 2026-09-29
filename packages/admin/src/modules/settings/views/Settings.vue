<script setup lang="ts">
import { useHead } from "@unhead/vue";
import Icon from "@/shared/components/Icon.vue";
import { useSettings } from "@/shared/composables/useMenu";

useHead({ title: "Settings" });
const settings = useSettings();
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="mb-6 text-2xl font-semibold">Settings</h1>
    <p v-if="!settings.length" class="text-muted-foreground">No settings yet.</p>
    <section v-for="group in settings" :key="group.label" class="mb-8">
      <h2 class="mb-3 text-lg font-semibold">{{ group.label }}</h2>
      <div class="divide-border border-border bg-card divide-y rounded-lg border">
        <RouterLink
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="hover:bg-muted/50 flex items-center gap-3 p-4"
        >
          <Icon :name="item.icon" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{{ item.label }}</div>
            <div v-if="item.description" class="text-muted-foreground text-sm">
              {{ item.description }}
            </div>
          </div>
          <Icon name="chevron-right" class="text-muted-foreground" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>
