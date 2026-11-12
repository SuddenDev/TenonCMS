<script setup lang="ts">
import LinkedDeletionDialog from "@/shared/components/LinkedDeletionDialog.vue";
import ActionConfirmDialog from "@/shared/components/ActionConfirmDialog.vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
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
  useBreadcrumbs,
  useAppBar,
  useLocale,
  useLocaleFromRoute,
  localeLabel,
  type Perspective,
} from "@/shared";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { useAction } from "@/shared/composables/useAction";

const { t } = useI18n();
const route = useRoute();
const { name, headerLogo, icon } = useBrand();
const tools = useAppBar();
const { run, isRunning } = useAction();
const { perspective, set, switching, error: perspectiveError } = usePerspective();
useLocaleFromRoute();
const { locales, defaultLocale, locale, select } = useLocale();
const perspectives = [
  { value: "drafts", label: "common.drafts" },
  { value: "published", label: "common.published" },
] as const;
const trail = useBreadcrumbs();
const pageTitle = computed(() => trail.value.at(-1)?.label ?? t("nav.page"));
const row = ref<HTMLElement>();
providePanes(row);
</script>

<template>
  <div class="bg-background flex h-svh flex-col overflow-hidden">
    <header
      class="border-border flex h-12 shrink-0 items-center justify-between gap-5 border-b px-3"
    >
      <div class="flex flex-1 items-center gap-2">
        <Sheet>
          <SheetTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="sm:hidden" :aria-label="t('nav.menu')">
              <Icon name="menu" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" class="gap-1 p-3">
            <SheetTitle class="px-2 py-1.5">{{ name }}</SheetTitle>
            <SheetClose v-for="t in tools" :key="t.action ?? t.href ?? t.to" as-child>
              <Button v-if="t.href" as-child variant="ghost" class="justify-start gap-2">
                <a :href="t.href" target="_blank" rel="noopener noreferrer">
                  <Icon :name="t.icon" />{{ t.label }}
                </a>
              </Button>
              <Button
                v-else-if="t.action"
                variant="ghost"
                class="justify-start gap-2"
                :disabled="isRunning(t.action)"
                @click="run(t.action, t.label, t.confirm)"
              >
                <Icon :name="t.icon" />{{ t.label }}
              </Button>
              <Button
                v-else
                as-child
                :variant="t.active ? 'secondary' : 'ghost'"
                class="justify-start gap-2"
              >
                <RouterLink :to="t.to"><Icon :name="t.icon" />{{ t.label }}</RouterLink>
              </Button>
            </SheetClose>
            <Separator class="my-2" />
            <Button as-child variant="ghost" class="justify-start gap-2">
              <a href="/" rel="noopener noreferrer"><Icon name="globe" />{{ t("nav.goToSite") }}</a>
            </Button>
          </SheetContent>
        </Sheet>
        <RouterLink to="/" class="flex items-center gap-2">
          <Themed
            v-if="headerLogo"
            :src="headerLogo"
            :alt="name"
            class="h-7 max-w-40 object-contain"
          />
          <template v-else>
            <Themed :src="icon" class="size-7 object-contain" />
            <span class="text-sm font-medium">{{ name }}</span>
          </template>
        </RouterLink>
      </div>
      <nav class="flex flex-1 items-center gap-1 max-sm:hidden">
        <template v-for="t in tools" :key="t.action ?? t.href ?? t.to">
          <Button v-if="t.href" as-child size="sm" variant="ghost" class="gap-1.5">
            <a :href="t.href" target="_blank" rel="noopener noreferrer">
              <Icon :name="t.icon" />{{ t.label }}
            </a>
          </Button>
          <Button
            v-else-if="t.action"
            size="sm"
            variant="ghost"
            class="gap-1.5"
            :disabled="isRunning(t.action)"
            @click="run(t.action, t.label, t.confirm)"
          >
            <Icon
              :name="isRunning(t.action) ? 'loader-circle' : t.icon"
              :class="isRunning(t.action) && 'animate-spin'"
            />
            {{ t.label }}
          </Button>
          <Button v-else as-child size="sm" :variant="t.active ? 'secondary' : 'ghost'">
            <RouterLink :to="t.to">{{ t.label }}</RouterLink>
          </Button>
        </template>
      </nav>
      <div class="flex shrink grow-0 items-center gap-1.5">
        <Button as-child variant="ghost" size="sm" class="gap-1.5 text-xs max-sm:hidden">
          <a href="/" rel="noopener noreferrer"
            ><Icon name="globe" class="" /><span>{{ t("nav.goToSite") }}</span></a
          >
        </Button>
        <DropdownMenu v-if="locales.length">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 text-xs"
              :aria-label="t('nav.language')"
            >
              {{ locale?.toUpperCase() }}
              <Icon name="chevron-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              :model-value="locale"
              @update:model-value="(l) => select(l as string)"
            >
              <DropdownMenuRadioItem v-for="l in locales" :key="l" :value="l">
                {{ localeLabel(l) }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="sm" class="gap-1.5 text-xs" :disabled="switching">
              <span
                :data-perspective="perspective"
                class="size-2 rounded-full data-[perspective=drafts]:bg-amber-500 data-[perspective=published]:bg-emerald-500"
                aria-hidden="true"
              />
              {{ t(perspective === "drafts" ? "common.drafts" : "common.published") }}
              <Icon name="chevron-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              :model-value="perspective"
              @update:model-value="(p) => set(p as Perspective)"
            >
              <DropdownMenuRadioItem v-for="p in perspectives" :key="p.value" :value="p.value">
                {{ t(p.label) }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" class="h-6 self-center!" />
        <Button variant="ghost" size="icon-sm" :aria-label="t('nav.search')">
          <Icon name="search" />
        </Button>
        <NavUser />
      </div>
    </header>
    <p
      v-if="perspectiveError"
      class="text-destructive border-border border-b px-3 py-2 text-sm"
      role="alert"
    >
      {{ perspectiveError }}
    </p>
    <LinkedDeletionDialog />
    <ActionConfirmDialog />
    <TooltipProvider :delay-duration="300">
      <div ref="row" class="flex min-h-0 flex-1 overflow-x-auto">
        <div v-if="route.meta.full" class="flex min-w-0 flex-1 flex-col">
          <header
            v-if="route.meta.pageHeader"
            class="border-border flex h-12 shrink-0 items-center border-b px-4"
          >
            <PageTitle :value="route.meta.pageHeader" />
          </header>
          <main class="min-h-0 flex-1 overflow-auto"><slot /></main>
        </div>
        <template v-else>
          <MenuPane v-if="route.meta.menu !== false" />
          <slot v-if="route.meta.panes" />
          <Pane v-else :title="pageTitle" :min="448" grow :collapsible="false">
            <template #header>
              <header
                v-if="route.meta.pageHeader"
                class="border-border flex h-12 shrink-0 items-center border-b px-4"
              >
                <PageTitle :value="route.meta.pageHeader" />
              </header>
            </template>
            <main class="h-full"><slot /></main>
          </Pane>
        </template>
      </div>
    </TooltipProvider>
  </div>
</template>
