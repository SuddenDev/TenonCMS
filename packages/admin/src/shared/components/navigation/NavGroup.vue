<script setup lang="ts">
import { useRoute } from "vue-router";
import Icon from "@/shared/components/Icon.vue";
import type { MenuItem } from "@/shared/composables/useMenu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/shared/components/ui/sidebar";

defineProps<{ label: string; items: MenuItem[] }>();

const route = useRoute();
const at = (to: string) => route.path === to || route.path.startsWith(`${to}/`);
const active = (item: MenuItem) => [item.to, ...(item.also ?? [])].some(at);
const open = (item: MenuItem) => active(item) || !!item.children?.some(active);
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>{{ label }}</SidebarGroupLabel>
    <SidebarMenu>
      <template v-for="item in items" :key="item.to">
        <Collapsible
          v-if="item.children?.length"
          as-child
          :default-open="open(item)"
          class="group/collapsible"
        >
          <SidebarMenuItem>
            <CollapsibleTrigger as-child>
              <SidebarMenuButton :tooltip="item.label" :is-active="active(item)">
                <Icon :name="item.icon" />
                <span>{{ item.label }}</span>
                <Icon
                  name="chevron-right"
                  class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                <SidebarMenuSubItem v-for="child in item.children" :key="child.to">
                  <SidebarMenuSubButton as-child :is-active="active(child)">
                    <RouterLink :to="child.to">
                      <span>{{ child.label }}</span>
                    </RouterLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
        <SidebarMenuItem v-else>
          <SidebarMenuButton as-child :tooltip="item.label" :is-active="active(item)">
            <RouterLink :to="item.to">
              <Icon :name="item.icon" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </template>
    </SidebarMenu>
  </SidebarGroup>
</template>
