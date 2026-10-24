<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { localeLabel, useBrand, Themed, Icon } from "@/shared";
import { useAdminLocale } from "@/shared/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

defineProps<{
  title: string;
  description?: string;
  /** Shows the title and description. Otherwise only screen readers get them. */
  heading?: boolean;
}>();
const { name, logo, icon } = useBrand();
const { locale, locales } = useAdminLocale();
const { t } = useI18n();
</script>

<template>
  <main class="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-6 md:p-10">
    <div class="mb-2 flex items-center gap-2 px-6">
      <Themed :src="logo ?? icon" :alt="name" class="h-8 max-w-48 object-contain" />
      <span v-if="!logo" class="font-medium">{{ name }}</span>
    </div>
    <Card class="w-full max-w-sm gap-6 py-5">
      <CardHeader class="px-5" :class="!heading && 'sr-only'">
        <CardTitle class="text-lg">{{ title }}</CardTitle>
        <CardDescription v-if="description">{{ description }}</CardDescription>
      </CardHeader>
      <CardContent class="px-5">
        <slot></slot>
      </CardContent>
    </Card>
    <div class="flex w-full max-w-sm items-center justify-between gap-2">
      <Button variant="ghost" size="sm" class="text-muted-foreground" as-child>
        <a href="/"><Icon name="arrow-left" />{{ t("auth.backToSite") }}</a>
      </Button>
      <DropdownMenu v-if="locales.length">
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            :aria-label="t('nav.language')"
          >
            <Icon name="languages" />{{ localeLabel(locale) }}<Icon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup v-model="locale">
            <DropdownMenuRadioItem v-for="code in locales" :key="code" :value="code">
              {{ localeLabel(code) }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </main>
</template>
