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
  list?: boolean;
  pick?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  open: [event: MouseEvent];
  select: [event: MouseEvent];
  rename: [];
  move: [];
  delete: [];
}>();
const { t, locale } = useI18n();
</script>

<template>
  <li class="relative">
    <Button
      type="button"
      variant="ghost"
      :data-selected="selected"
      class="hover:bg-muted/50 border-border h-auto w-full overflow-hidden rounded-lg text-left font-normal whitespace-normal disabled:opacity-40"
      :class="
        list
          ? ['flex-row items-center gap-3 py-1.5 pl-10', pick ? 'pr-3' : 'pr-12']
          : 'flex-col items-stretch gap-0 p-1.5 @2xl:p-2'
      "
      :disabled="!allowed || disabled"
      :aria-pressed="pick ? selected : undefined"
      :title="allowed ? doc.filename : `${doc.filename}: ${t('media.notAllowed')}`"
      @click="emit('open', $event)"
    >
      <template v-if="list">
        <MediaThumb :doc="doc" sizes="40px" class="size-10 shrink-0" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ doc.filename }}</span>
        <span class="text-muted-foreground hidden w-16 shrink-0 text-xs @md:block">{{
          t(`media.types.${fileType(doc.mimeType)}`)
        }}</span>
        <span class="text-muted-foreground w-16 shrink-0 text-right text-xs">{{
          formatSize(doc.size, locale)
        }}</span>
      </template>
      <template v-else>
        <span class="flex min-w-0 items-center gap-2 pt-1 pr-7 pb-2 pl-1 @2xl:pb-3">
          <Icon :name="fileIcon(doc.mimeType)" class="text-muted-foreground text-xs!" />
          <span class="min-w-0 flex-1 truncate text-xs @2xl:text-sm">{{ doc.filename }}</span>
        </span>
        <MediaThumb
          :doc="doc"
          sizes="(max-width: 640px) 50vw, 200px"
          class="aspect-square w-full"
        />
        <span
          class="text-muted-foreground flex h-9 items-center gap-2 px-1 pt-2 text-xs"
          :class="!pick && 'pr-8'"
        >
          <span class="truncate">{{ formatSize(doc.size, locale) }}</span>
          <span aria-hidden="true">·</span>
          <span class="truncate">{{ t(`media.types.${fileType(doc.mimeType)}`) }}</span>
        </span>
      </template>
    </Button>
    <Checkbox
      :model-value="selected"
      :disabled="!allowed || disabled"
      :aria-label="t('media.selectFile', { name: doc.filename })"
      class="absolute"
      :class="list ? 'top-1/2 left-3 -translate-y-1/2' : 'top-3.5 right-3 @2xl:top-4'"
      @click="emit('select', $event)"
    />
    <div
      v-if="!pick"
      class="absolute"
      :class="
        list
          ? 'top-1/2 right-2 -translate-y-1/2'
          : 'right-1.5 bottom-1.5 @2xl:right-2 @2xl:bottom-2'
      "
    >
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
