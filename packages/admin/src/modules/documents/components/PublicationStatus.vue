<script setup lang="ts">
import { computed, ref } from "vue";
import { useTimeoutFn } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { usePerspective } from "@/shared/composables/usePerspective";
import { ago } from "@/shared/utils";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

const props = defineProps<{
  doc: Record<string, unknown>;
  compact?: boolean;
  missing?: boolean;
}>();
const { t, locale } = useI18n();
const { perspective, set, switching } = usePerspective();
const open = ref(false);
const { start: close, stop: keepOpen } = useTimeoutFn(() => (open.value = false), 150, {
  immediate: false,
});
function show() {
  keepOpen();
  open.value = true;
}
const dateFormat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: "long", timeStyle: "medium" }),
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
const dot =
  "size-1.5 shrink-0 rounded-full data-[status=published]:bg-emerald-500 data-[status=drafts]:border data-[status=drafts]:data-[exists=true]:bg-amber-500 data-[status=drafts]:border-amber-500";
</script>

<template>
  <Popover v-if="compact" v-model:open="open">
    <PopoverAnchor as-child>
      <span
        class="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-end gap-2 rounded-sm"
        tabindex="0"
        role="img"
        :aria-label="statuses.map((s) => `${s.label}: ${s.detail}`).join('. ')"
        @pointerenter="show"
        @pointerleave="close()"
        @focus="show"
        @blur="close()"
      >
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
    </PopoverContent>
  </Popover>
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
  </span>
</template>
