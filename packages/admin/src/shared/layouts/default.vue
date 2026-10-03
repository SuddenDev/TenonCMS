<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import Icon from "@/shared/components/Icon.vue";
import Themed from "@/shared/components/Themed.vue";
import AppBreadcrumbs from "@/shared/components/navigation/AppBreadcrumbs.vue";
import MenuPane from "@/shared/components/navigation/MenuPane.vue";
import NavUser from "@/shared/components/navigation/NavUser.vue";
import Pane from "@/shared/components/pane/Pane.vue";
import { Button } from "@/shared/components/ui/button";
import { useBrand } from "@/shared/composables/useBrand";
import { providePanes } from "@/shared/composables/usePanes";

const route = useRoute();
const { name, logo, icon } = useBrand();
const row = ref<HTMLElement>();
providePanes(row);
</script>

<template>
  <div class="bg-background flex h-svh flex-col overflow-hidden">
    <header class="border-border flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <RouterLink to="/" class="flex items-center gap-2">
        <Themed v-if="logo" :src="logo" :alt="name" class="h-7 max-w-40 object-contain" />
        <template v-else>
          <span
            class="flex size-7 items-center justify-center rounded-md"
            :class="!icon && 'bg-primary text-primary-foreground'"
          >
            <Themed v-if="icon" :src="icon" class="size-7 object-contain" />
            <Icon v-else name="box" />
          </span>
          <span class="text-sm font-medium">{{ name }}</span>
        </template>
      </RouterLink>
      <div class="ml-auto flex items-center gap-1">
        <Button as-child variant="ghost" size="sm" class="gap-1.5 text-xs">
          <a href="/" rel="noopener noreferrer"
            ><Icon name="globe" class="" /><span class="max-sm:sr-only">Go to site</span></a
          >
        </Button>
        <NavUser />
      </div>
    </header>
    <div ref="row" class="flex min-h-0 flex-1 overflow-x-auto">
      <MenuPane />
      <slot v-if="route.meta.panes" />
      <Pane v-else title="Page" :min="448" grow :collapsible="false">
        <template #header><AppBreadcrumbs /></template>
        <main class="p-6"><slot /></main>
      </Pane>
    </div>
  </div>
</template>
