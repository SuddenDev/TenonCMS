<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { MediaRead } from "@/shared/api";
import { fileIcon, fileType, formatSize, mediaDownload } from "../media";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import MediaItemMenu from "./MediaItemMenu.vue";
import MediaThumb from "./MediaThumb.vue";

defineProps<{
  doc: MediaRead;
  selected: boolean;
  allowed: boolean;
  pick?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ open: []; select: []; rename: []; move: []; delete: [] }>();
const { t, locale } = useI18n();
</script>

<template>
  <li class="relative">
    <Button
      type="button"
      variant="ghost"
      :data-selected="selected"
      class="hover:bg-muted/50 border-border h-auto w-full flex-col items-stretch gap-0 overflow-hidden rounded-lg p-2 text-left font-normal whitespace-normal disabled:opacity-40"
      :disabled="!allowed || disabled"
      :aria-pressed="pick ? selected : undefined"
      :title="allowed ? doc.filename : `${doc.filename}: ${t('media.notAllowed')}`"
      @click="emit('open')"
    >
      <span class="flex min-w-0 items-center gap-2 pt-1 pr-7 pb-3 pl-1">
        <Icon :name="fileIcon(doc.mimeType)" class="text-muted-foreground text-xs!" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ doc.filename }}</span>
      </span>
      <MediaThumb :doc="doc" sizes="(max-width: 640px) 50vw, 240px" class="aspect-square w-full" />
      <span
        class="text-muted-foreground flex h-9 items-center gap-2 px-1 pt-2 text-xs"
        :class="!pick && 'pr-8'"
      >
        <span>{{ formatSize(doc.size, locale) }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ t(`media.types.${fileType(doc.mimeType)}`) }}</span>
      </span>
    </Button>
    <Checkbox
      :model-value="selected"
      :disabled="!allowed || disabled"
      :aria-label="t('media.selectFile', { name: doc.filename })"
      class="absolute top-4 right-3"
      @update:model-value="emit('select')"
    />
    <div v-if="!pick" class="absolute right-2 bottom-2">
      <MediaItemMenu
        :name="doc.filename"
        :href="mediaDownload([doc.id])"
        :download-label="t('media.downloadFile', { name: doc.filename })"
        :disabled="disabled"
        @rename="emit('rename')"
        @move="emit('move')"
        @delete="emit('delete')"
      />
    </div>
  </li>
</template>
