<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLocale } from "@/shared/composables/useLocale";
import type { localeStatus } from "@/modules/documents/locale-status";

// "Published" once the document has a published version, "Draft" while it has unpublished changes or was never published.
// `languages`: the state of a localized entry. It replaces the dots with the active language's state and a row of language codes, which switch the language.
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
  <div v-if="languages" class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
    <span class="text-muted-foreground flex items-center gap-1.5">
      <span :class="dot" :data-state="languages.active" aria-hidden="true" />
      {{ t(labels[languages.active]) }}
    </span>
    <span class="flex flex-wrap gap-1" role="group" :aria-label="t('documents.languages')">
      <button
        v-for="s in languages.states"
        :key="s.locale"
        type="button"
        :data-active="s.locale === locale"
        :aria-label="`${s.locale.toUpperCase()}: ${t(labels[s.state])}`"
        :aria-pressed="s.locale === locale"
        class="text-muted-foreground hover:bg-muted data-[active=true]:bg-muted data-[active=true]:text-foreground flex items-center gap-1.5 rounded px-1.5 py-0.5"
        @click="select(s.locale)"
      >
        <span :class="dot" :data-state="s.state" aria-hidden="true" />
        {{ s.locale.toUpperCase() }}
      </button>
    </span>
  </div>
  <div v-else class="mt-2 flex gap-3 text-xs">
    <span v-if="props.doc.publishedAt" class="text-muted-foreground flex items-center gap-1.5">
      <span class="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
      {{ t("common.published") }}
    </span>
    <span
      v-if="props.doc.hasDraft || props.doc.publishedAt === null"
      class="text-muted-foreground flex items-center gap-1.5"
    >
      <span class="size-2 rounded-full bg-amber-500" aria-hidden="true" />
      {{ t("common.draft") }}
    </span>
  </div>
</template>
