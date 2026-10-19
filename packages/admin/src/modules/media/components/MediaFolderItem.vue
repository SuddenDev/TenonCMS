<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mediaDownload } from "../media";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import MediaItemMenu from "./MediaItemMenu.vue";

defineProps<{
  folder: { name: string; path: string };
  selected: boolean;
  pick?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ open: []; select: []; rename: []; move: []; delete: [] }>();
const { t } = useI18n();
</script>

<template>
  <li class="group relative h-12">
    <div v-if="!pick" class="absolute top-1/2 left-3 z-5 -translate-y-1/2">
      <Checkbox
        :model-value="selected"
        :disabled="disabled"
        :aria-label="t('media.selectFolder', { name: folder.name })"
        @update:model-value="emit('select')"
      />
    </div>
    <Button
      type="button"
      variant="ghost"
      class="hover:bg-muted/50 border-border flex h-full w-full min-w-0 flex-1 items-center justify-start gap-2 rounded-lg font-normal"
      :class="pick ? 'px-3' : 'pr-10 pl-9.5'"
      :title="folder.name"
      :disabled="disabled"
      @click="emit('open')"
    >
      <Icon name="folder" class="text-muted-foreground" />
      <span class="truncate">{{ folder.name }}</span>
    </Button>
    <div v-if="!pick" class="absolute top-1/2 right-2 z-5 -translate-y-1/2">
      <MediaItemMenu
        :name="folder.name"
        :href="mediaDownload([], [folder.path])"
        :download-label="t('media.downloadFolder', { name: folder.name })"
        :disabled="disabled"
        @rename="emit('rename')"
        @move="emit('move')"
        @delete="emit('delete')"
      />
    </div>
  </li>
</template>
