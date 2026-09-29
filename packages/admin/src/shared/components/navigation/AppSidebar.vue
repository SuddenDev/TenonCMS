<script setup lang="ts">
import Icon from "@/shared/components/Icon.vue";
import Themed from "@/shared/components/Themed.vue";
import { useBrand } from "@/shared/composables/useBrand";
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
const { name, logo, icon } = useBrand();

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
              <!-- The wrapper hides it: `dark:block` on the image would beat a `hidden` on the image. -->
              <div v-if="logo" class="min-w-0 group-data-[collapsible=icon]:hidden">
                <Themed :src="logo" :alt="name" class="h-8 max-w-full object-contain" />
              </div>
              <div
                class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg"
                :class="[
                  !icon && 'bg-sidebar-primary text-sidebar-primary-foreground',
                  logo && 'hidden group-data-[collapsible=icon]:flex',
                ]"
              >
                <Themed v-if="icon" :src="icon" class="size-8 object-contain" />
                <Icon v-else name="box" />
              </div>
              <div v-if="!logo" class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">{{ name }}</span>
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavGroup
        v-for="group in menu"
        :key="group.label"
        :label="group.label"
        :items="group.items"
      />
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
