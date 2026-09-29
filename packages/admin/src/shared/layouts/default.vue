<script setup lang="ts">
import AppBreadcrumbs from "@/shared/components/navigation/AppBreadcrumbs.vue";
import AppSidebar from "@/shared/components/navigation/AppSidebar.vue";
import { Separator } from "@/shared/components/ui/separator";
import { Button } from "@/shared/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/shared/components/ui/sidebar";
</script>

<template>
  <SidebarProvider>
    <AppSidebar variant="inset" />
    <SidebarInset>
      <header
        class="flex h-14 shrink-0 items-center justify-between gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
      >
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1" />
          <Separator
            orientation="vertical"
            class="mr-2 data-[orientation=vertical]:h-5 data-[orientation=vertical]:self-center"
          />
          <AppBreadcrumbs />
        </div>
        <!-- <div class="px-4 flex items-center justify-end">
          <Button> Action Button </Button>
        </div> -->
      </header>
      <main class="flex flex-1 flex-col gap-4 p-4">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
