<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Upload } from "../uploads";
import { formatSize } from "../media";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Spinner } from "@/shared/components/ui/spinner";

const props = defineProps<{ items: Upload[] }>();
const emit = defineEmits<{ cancel: [upload: Upload]; dismiss: [] }>();
const { t, locale } = useI18n();
const uploading = computed(() => props.items.some((item) => item.status === "uploading"));
const done = computed(() => props.items.filter((item) => item.status !== "uploading").length);
const total = computed(() => props.items.reduce((sum, item) => sum + item.total, 0));
const loaded = computed(() => props.items.reduce((sum, item) => sum + item.loaded, 0));
const progress = computed(() =>
  Math.min(
    uploading.value ? 99 : 100,
    Math.floor(
      100 * (total.value ? loaded.value / total.value : done.value / (props.items.length || 1)),
    ),
  ),
);
</script>

<template>
  <div
    data-slot="media-upload-progress"
    :aria-busy="uploading"
    class="bg-popover text-popover-foreground border-border w-[var(--width)] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border p-4 text-sm shadow-lg"
  >
    <div class="flex items-center gap-2">
      <Spinner v-if="uploading" />
      <Icon v-else name="upload" />
      <p class="mr-auto font-medium" role="status">
        {{
          uploading
            ? t("media.uploadingCount", { done, count: items.length })
            : t("media.uploadsFinished")
        }}
      </p>
      <Button
        v-if="!uploading"
        type="button"
        size="icon-sm"
        variant="ghost"
        :aria-label="t('common.dismiss')"
        @click="emit('dismiss')"
        ><Icon name="x"
      /></Button>
    </div>
    <template v-if="uploading">
      <Progress :model-value="progress" :aria-label="t('media.uploadProgress')" />
      <div class="text-muted-foreground flex justify-between text-xs">
        <span>{{ formatSize(loaded, locale) }} / {{ formatSize(total, locale) }}</span>
        <span>{{ progress }}%</span>
      </div>
    </template>
    <ul class="max-h-52 space-y-2 overflow-y-auto">
      <template v-for="(item, index) in items" :key="index">
        <li v-if="item.status !== 'completed'" class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <p class="truncate" :title="item.name">{{ item.name }}</p>
            <p
              v-if="item.error"
              class="text-xs"
              :class="item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'"
              :role="item.status === 'failed' ? 'alert' : undefined"
            >
              {{ item.error }}
            </p>
          </div>
          <Button
            v-if="item.status === 'uploading'"
            type="button"
            size="sm"
            variant="ghost"
            @click="emit('cancel', item)"
            >{{ t("common.cancel") }}</Button
          >
        </li>
      </template>
    </ul>
  </div>
</template>
