<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { useRoute } from "vue-router";
import { Pane, PaneMenu, PaneMenuItem, PaneMenuLabel, Icon } from "@/shared/";
import { useSettings } from "@/shared/composables/useMenu";

useHead({ title: "Settings" });
const settings = useSettings();
const route = useRoute();
</script>

<template>
  <Pane title="Settings">
    <p v-if="!settings.length" class="text-muted-foreground p-3 text-sm">No settings yet.</p>
    <PaneMenu layout="detailed">
      <template v-for="group in settings" :key="group.label">
        <PaneMenuLabel>{{ group.label }}</PaneMenuLabel>
        <PaneMenuItem
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :subtitle="item.description"
          :label="item.label"
          :active="route.path === item.to"
        >
          <template #end><Icon name="chevron-right" /></template>
        </PaneMenuItem>
      </template>
    </PaneMenu>
  </Pane>
  <RouterView v-slot="{ Component }">
    <component :is="Component" v-if="Component" :key="String(route.params.name)" />
    <div
      v-else
      class="text-muted-foreground hidden flex-1 items-center justify-center text-sm sm:flex"
    >
      Select a setting
    </div>
  </RouterView>
</template>
