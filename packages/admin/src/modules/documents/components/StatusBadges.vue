<script setup lang="ts">
import { useI18n } from "vue-i18n";
import PublicationStatus from "./PublicationStatus.vue";
import { useLocale } from "@/shared/composables/useLocale";
import type { localeStatus } from "@/modules/documents/locale-status";
import { localeLabel } from "@/shared/locale";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const props = defineProps<{
  doc: Record<string, unknown>;
  languages?: ReturnType<typeof localeStatus>;
}>();
const { t } = useI18n();
const { locale, select } = useLocale();

const dot =
  "size-2 rounded-full data-[state=published]:bg-emerald-500 data-[state=draft]:bg-amber-500 data-[state=missing]:border data-[state=missing]:border-muted-foreground";
const labels = {
  published: "common.published",
  draft: "common.draft",
  missing: "common.notTranslated",
} as const;
</script>

<template>
  <div class="flex min-w-0 items-center gap-2 text-xs">
    <PublicationStatus :doc="doc" :missing="languages?.active === 'missing'" />
    <span v-if="languages?.active === 'missing'" class="text-muted-foreground">
      {{ t("common.notTranslated") }}
    </span>
    <DropdownMenu v-if="languages">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="ml-auto min-w-0 gap-1.5"
          :aria-label="`${t('documents.languages')}: ${localeLabel(locale ?? '')}`"
        >
          <Icon name="languages" class="text-muted-foreground" />
          <span class="truncate">{{ localeLabel(locale ?? "") }}</span>
          <Icon name="chevron-down" class="text-muted-foreground size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-48">
        <DropdownMenuRadioGroup
          :model-value="locale"
          @update:model-value="(value) => typeof value === 'string' && select(value)"
        >
          <DropdownMenuRadioItem
            v-for="s in languages.states"
            :key="s.locale"
            :value="s.locale"
            class="gap-3"
          >
            <div class="flex items-center gap-2">
              <span :class="dot" :title="t(labels[s.state])" :data-state="s.state" />
              <span class="flex-1">{{ localeLabel(s.locale) }}</span>
            </div>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
