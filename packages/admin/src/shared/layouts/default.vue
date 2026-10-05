<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";

import {
  useBrand,
  providePanes,
  NavUser,
  MenuPane,
  PageTitle,
  Themed,
  Icon,
  Pane,
  usePerspective,
  useAppBar,
  type Perspective,
} from "@/shared";

const route = useRoute();
const { name, logo, icon } = useBrand();
const tools = useAppBar();
const { perspective, set } = usePerspective();
const perspectives = [
  { value: "drafts", label: "Drafts" },
  { value: "published", label: "Published" },
] as const;
const row = ref<HTMLElement>();
providePanes(row);
</script>

<template>
  <div class="bg-background flex h-svh flex-col overflow-hidden">
    <header
      class="border-border flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3"
    >
      <div class="flex items-center gap-2">
        <Sheet>
          <SheetTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="sm:hidden" aria-label="Menu">
              <Icon name="menu" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" class="gap-1 p-3">
            <SheetTitle class="px-2 py-1.5">{{ name }}</SheetTitle>
            <SheetClose v-for="t in tools" :key="t.to" as-child>
              <Button
                as-child
                :variant="t.active ? 'secondary' : 'ghost'"
                class="justify-start gap-2"
              >
                <RouterLink :to="t.to"><Icon :name="t.icon" />{{ t.label }}</RouterLink>
              </Button>
            </SheetClose>
            <Separator class="my-2" />
            <Button as-child variant="ghost" class="justify-start gap-2">
              <a href="/" rel="noopener noreferrer"><Icon name="globe" />Go to site</a>
            </Button>
          </SheetContent>
        </Sheet>
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
      </div>
      <nav class="flex items-center gap-1 max-sm:hidden">
        <Button
          v-for="t in tools"
          :key="t.to"
          as-child
          size="sm"
          :variant="t.active ? 'secondary' : 'ghost'"
        >
          <RouterLink :to="t.to">{{ t.label }}</RouterLink>
        </Button>
      </nav>
      <div class="flex items-center gap-1.5">
        <Button as-child variant="ghost" size="sm" class="gap-1.5 text-xs max-sm:hidden">
          <a href="/" rel="noopener noreferrer"
            ><Icon name="globe" class="" /><span>Go to site</span></a
          >
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="sm" class="gap-1.5 text-xs">
              <span
                :data-perspective="perspective"
                class="size-2 rounded-full data-[perspective=drafts]:bg-amber-500 data-[perspective=published]:bg-emerald-500"
                aria-hidden="true"
              />
              {{ perspective === "drafts" ? "Drafts" : "Published" }}
              <Icon name="chevron-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              :model-value="perspective"
              @update:model-value="(p) => set(p as Perspective)"
            >
              <DropdownMenuRadioItem v-for="p in perspectives" :key="p.value" :value="p.value">
                {{ p.label }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" class="h-6 self-center!" />
        <Button variant="ghost" size="icon-sm" class="">
          <Icon name="search" class="" />
        </Button>
        <NavUser />
      </div>
    </header>
    <div ref="row" class="flex min-h-0 flex-1 overflow-x-auto">
      <div v-if="route.meta.full" class="flex min-w-0 flex-1 flex-col">
        <header
          v-if="route.meta.pageTitle !== false"
          class="border-border flex h-12 shrink-0 items-center border-b px-4"
        >
          <PageTitle :value="route.meta.pageTitle ?? true" />
        </header>
        <main class="min-h-0 flex-1 overflow-auto"><slot /></main>
      </div>
      <template v-else>
        <MenuPane v-if="route.meta.menu !== false" />
        <slot v-if="route.meta.panes" />
        <Pane v-else title="Page" :min="448" grow :collapsible="false">
          <template #header><PageTitle :value="route.meta.pageTitle ?? true" /></template>
          <main class="h-full"><slot /></main>
        </Pane>
      </template>
    </div>
  </div>
</template>
