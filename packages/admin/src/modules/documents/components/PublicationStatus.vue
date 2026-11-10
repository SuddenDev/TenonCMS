<script setup lang="ts">
import { computed, ref } from "vue";
import { useTimeoutFn } from "@vueuse/core";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { useI18n } from "vue-i18n";
import type { Job } from "../../../../../core/src/jobs/types";
import { groupSchedules } from "@/modules/jobs/jobs";
import { useLocale } from "@/shared/composables/useLocale";
import { usePerspective } from "@/shared/composables/usePerspective";
import { localeLabel } from "@/shared/locale";
import { ago, formatDateTime } from "@/shared/utils";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

// `scheduled`: the queued publishes and unpublishes of the document. A clock joins the row, and hovering it lists them.
const props = defineProps<{
  doc: Record<string, unknown>;
  compact?: boolean;
  missing?: boolean;
  scheduled?: Job[];
}>();
const { t, locale } = useI18n();
const { timeZone } = useTimeZone();
const { perspective, set, switching } = usePerspective();
const { locales } = useLocale();
const open = ref(false);
const { start: close, stop: keepOpen } = useTimeoutFn(() => (open.value = false), 150, {
  immediate: false,
});
function show() {
  keepOpen();
  open.value = true;
}
const dateFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      dateStyle: "long",
      timeStyle: "medium",
      timeZone: timeZone.value,
    }),
);
const published = computed(() => !props.missing && !!props.doc.publishedAt);
const draft = computed(
  () => !props.missing && (!!props.doc.hasDraft || !!props.doc.sharedDraft || !published.value),
);
const statuses = computed(() => [
  {
    value: "published" as const,
    label: t("common.published"),
    exists: published.value,
    savedAt: published.value ? (props.doc.publishedAt as string) : undefined,
    detail: published.value
      ? t("documents.publishedAgo", { ago: ago(props.doc.publishedAt as string, locale.value) })
      : t("documents.notPublished"),
  },
  {
    value: "drafts" as const,
    label: t("common.draft"),
    exists: draft.value,
    savedAt: props.missing ? undefined : (props.doc.updatedAt as string | undefined),
    detail: draft.value
      ? t("documents.edited", { ago: ago(props.doc.updatedAt as string, locale.value) })
      : t("documents.noDraft"),
  },
]);
// One line per action and time, so languages released together share a line.
const schedules = computed(() =>
  groupSchedules(props.scheduled ?? []).map((group) => ({
    key: `${group.action} ${group.runAt}`,
    label: t(
      group.action === "unpublish" ? "documents.scheduledUnpublish" : "documents.scheduledPublish",
      { when: formatDateTime(group.runAt, locale.value, timeZone.value) },
    ),
    detail:
      group.locales.length > 1 && group.locales.length === locales.value.length
        ? t("documents.allLanguages")
        : group.locales.map((l) => localeLabel(l)).join(", "),
  })),
);
const scheduleText = computed(() =>
  schedules.value.map((s) => (s.detail ? `${s.label} (${s.detail})` : s.label)).join(". "),
);
const dot =
  "size-1.5 shrink-0 rounded-full data-[status=published]:bg-emerald-500 data-[status=drafts]:border data-[status=drafts]:data-[exists=true]:bg-amber-500 data-[status=drafts]:border-amber-500";
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor v-if="compact" as-child>
      <span
        class="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-end gap-2 rounded-sm"
        tabindex="0"
        role="img"
        :aria-label="
          [...statuses.map((s) => `${s.label}: ${s.detail}`), scheduleText]
            .filter(Boolean)
            .join('. ')
        "
        @pointerenter="show"
        @pointerleave="close()"
        @focus="show"
        @blur="close()"
      >
        <Icon v-if="schedules.length" name="clock" class="text-scheduled text-[10px]" />
        <span
          v-if="draft"
          :class="dot"
          data-status="drafts"
          :data-exists="!!draft"
          aria-hidden="true"
        />
        <span
          v-if="published"
          :class="dot"
          data-status="published"
          :data-exists="!!published"
          aria-hidden="true"
        />
      </span>
    </PopoverAnchor>
    <span v-else class="inline-flex shrink-0 items-center gap-1" role="group">
      <Tooltip v-for="status in statuses" :key="status.value">
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-6 gap-1.5 rounded-full border px-2.5 text-xs font-normal"
            :class="
              perspective === status.value
                ? {
                    'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300':
                      status.value === 'drafts' && status.exists,
                    'border-border bg-border': status.value === 'drafts' && !status.exists,
                    'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300':
                      status.value === 'published',
                  }
                : 'border-border text-muted-foreground'
            "
            :aria-pressed="perspective === status.value"
            :disabled="switching || (status.value === 'published' && !published)"
            @click="set(status.value)"
          >
            <span
              :class="[dot]"
              :data-status="status.value"
              :data-exists="!!status.exists"
              aria-hidden="true"
            />
            {{ status.label }}
          </Button>
        </TooltipTrigger>
        <TooltipContent align="center" side="bottom">
          <time v-if="status.savedAt && status.exists" :datetime="status.savedAt">{{
            dateFormat.format(new Date(status.savedAt))
          }}</time>
          <span v-else>{{ status.detail }}</span>
        </TooltipContent>
      </Tooltip>
      <PopoverAnchor v-if="schedules.length" as-child>
        <span
          class="border-scheduled/30 bg-scheduled/10 text-scheduled inline-flex size-6 items-center justify-center rounded-full border"
          tabindex="0"
          role="img"
          :aria-label="`${t('documents.scheduled')}: ${scheduleText}`"
          @pointerenter="show"
          @pointerleave="close()"
          @focus="show"
          @blur="close()"
        >
          <Icon name="clock" class="text-[10px]" />
        </span>
      </PopoverAnchor>
    </span>
    <PopoverContent
      side="bottom"
      align="center"
      :align-offset="-12"
      :side-offset="6"
      class="w-auto min-w-44 gap-3 p-3 text-xs"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @pointerenter="keepOpen"
      @pointerleave="close()"
    >
      <template v-if="compact">
        <div
          v-for="status in statuses.filter((s) => s.exists)"
          :key="status.value"
          class="flex items-start gap-4"
        >
          <div class="flex-1">
            <p>{{ status.label }}</p>
            <p class="text-muted-foreground mt-0.5">{{ status.detail }}</p>
          </div>
          <span
            :class="[dot, 'mt-1']"
            :data-status="status.value"
            :data-exists="!!status.exists"
            aria-hidden="true"
          />
        </div>
      </template>
      <div v-for="s in schedules" :key="s.key" class="flex items-start gap-4">
        <div class="flex-1">
          <p>{{ s.label }}</p>
          <p v-if="s.detail" class="text-muted-foreground mt-0.5">{{ s.detail }}</p>
        </div>
        <Icon name="clock" class="text-scheduled mt-0.5 text-[10px]" />
      </div>
    </PopoverContent>
  </Popover>
</template>
