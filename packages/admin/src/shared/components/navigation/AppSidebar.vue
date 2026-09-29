<script setup lang="ts">
import Icon from "@/shared/components/Icon.vue";
import { type MenuItem, useMenu } from "@/shared/composables/useMenu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  type SidebarProps,
} from "@/shared/components/ui/sidebar";
import NavGroup from "./NavGroup.vue";
import NavUser from "./NavUser.vue";

const props = withDefaults(defineProps<SidebarProps>(), { collapsible: "icon" });
const menu = useMenu();

// ponytail: placeholder that shows nested items. Replace once a feature needs a second group.
const projects: MenuItem[] = [
  {
    label: "Example project",
    icon: "frame",
    to: "/projects/example",
    order: 0,
    children: [
      { label: "Overview", icon: "file", to: "/projects/example/overview", order: 0 },
      { label: "Settings", icon: "settings", to: "/projects/example/settings", order: 1 },
    ],
  },
];
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <RouterLink to="/">
              <!-- Logo placeholder. -->
              <div
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <Icon name="box" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">integral-cms</span>
                <!-- <span class="truncate text-xs">Admin</span> -->
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavGroup label="Content" :items="menu.content" />
      <NavGroup v-if="menu.pages.length" label="Pages" :items="menu.pages" />
      <!-- <NavGroup label="Projects" :items="projects" class="group-data-[collapsible=icon]:hidden" /> -->
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child tooltip="View site">
            <a href="/">
              <Icon name="external-link" />
              <span>Go to site</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarSeparator />
      <NavUser />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
