<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { mediaDownload } from "../media";

const props = defineProps<{
  selected: string[];
  selectedFolders: string[];
  itemCount: number;
  showSelection: boolean;
  busy: boolean;
  job: { done: number; total: number };
}>();
const emit = defineEmits<{ selectAll: []; clear: []; move: []; delete: [] }>();
const { t } = useI18n();
const count = computed(() => props.selected.length + props.selectedFolders.length);
</script>

<template>
  <footer
    v-if="showSelection || busy"
    data-slot="media-actions"
    class="bg-background border-border flex shrink-0 flex-col gap-3 border-t px-4 py-3 sm:px-6"
  >
    <div
      v-if="showSelection"
      class="flex flex-wrap items-center gap-2"
      role="group"
      :aria-label="t('media.fileActions')"
      :aria-busy="busy"
    >
      <span class="text-muted-foreground mr-auto text-sm font-medium" role="status">{{
        count
          ? t("media.selectedItemsCount", { count })
          : t("media.itemCount", { count: itemCount })
      }}</span>
      <div v-if="count || busy" class="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" :disabled="busy" @click="emit('clear')">{{
          t("media.clearSelection")
        }}</Button>
        <Button
          as="a"
          :href="mediaDownload(selected, selectedFolders)"
          download
          size="sm"
          variant="outline"
          :aria-disabled="busy"
          @click="busy && $event.preventDefault()"
          ><Icon name="download" />{{ t("media.download") }}</Button
        >
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="busy || !count"
          @click="emit('move')"
          ><Icon name="folder-input" />{{ t("media.move") }}</Button
        >
        <Button
          type="button"
          size="sm"
          variant="destructive"
          :disabled="busy || !count"
          @click="emit('delete')"
          ><Icon name="trash-2" />{{ t("common.delete") }}</Button
        >
      </div>
      <Button
        v-else
        type="button"
        size="sm"
        variant="ghost"
        :disabled="busy || !itemCount"
        @click="emit('selectAll')"
        >{{ t("media.selectAll") }}</Button
      >
    </div>
    <div v-if="busy" class="space-y-2 text-sm" role="status">
      <Progress :model-value="job.total ? (job.done / job.total) * 100 : 0" class="h-1.5" />
      {{ t("media.processingFiles", { done: job.done, total: job.total }) }}
    </div>
  </footer>
</template>
