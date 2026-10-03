<script setup lang="ts">
import { useRoute } from "vue-router";
import {
  Pane,
  PaneMenu,
  PaneMenuItem,
  PaneMenuLabel,
  Icon,
  type MenuItem,
  useMenu,
} from "@/shared";

const menu = useMenu();
const route = useRoute();
const at = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
const active = (item: MenuItem) => [item.to, ...(item.also ?? [])].some(at);
</script>

<template>
  <Pane title="Content">
    <PaneMenu layout="compact">
      <template v-for="group in menu" :key="group.label">
        <PaneMenuLabel>{{ group.label }}</PaneMenuLabel>
        <PaneMenuItem
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          :active="active(item)"
        >
          <template #end><Icon name="chevron-right" /></template>
        </PaneMenuItem>
      </template>
    </PaneMenu>
  </Pane>
</template>
