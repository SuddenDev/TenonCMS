<script setup lang="ts">
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Pane,
  PaneMenu,
  PaneMenuItem,
  PaneMenuLabel,
  Icon,
  type MenuItem,
  useMenu,
} from "@/shared";
import { useAction } from "@/shared/composables/useAction";

const { t } = useI18n();
const menu = useMenu();
const route = useRoute();
const at = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
const active = (item: MenuItem) => !!item.to && [item.to, ...(item.also ?? [])].some(at);
const { run, isRunning } = useAction();
</script>

<template>
  <Pane :title="t('nav.content')">
    <PaneMenu layout="compact">
      <template v-for="group in menu" :key="group.label">
        <PaneMenuLabel>{{ group.label }}</PaneMenuLabel>
        <template v-for="item in group.items" :key="item.action ?? item.href ?? item.to">
          <PaneMenuItem
            v-if="item.href"
            as="a"
            :href="item.href"
            target="_blank"
            rel="noopener noreferrer"
            :icon="item.icon"
            :label="item.label"
          >
            <template #end><Icon name="arrow-up-right" /></template>
          </PaneMenuItem>
          <PaneMenuItem
            v-else-if="item.action"
            :icon="item.icon"
            :label="item.label"
            :disabled="isRunning(item.action)"
            @click="run(item.action, item.label, item.confirm)"
          >
            <template v-if="isRunning(item.action)" #end>
              <Icon name="loader-circle" class="animate-spin" />
            </template>
          </PaneMenuItem>
          <PaneMenuItem
            v-else
            :to="item.to"
            :icon="item.icon"
            :label="item.label"
            :active="active(item)"
          >
            <template #end><Icon name="chevron-right" /></template>
          </PaneMenuItem>
        </template>
      </template>
    </PaneMenu>
  </Pane>
</template>
