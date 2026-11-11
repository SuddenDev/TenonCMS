<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, type Field, type MediaRead } from "@/shared/api";
import { moveItem } from "@/modules/documents/items";
import { uploadFiles } from "../uploads";
import MediaPicker from "./MediaPicker.vue";
import MediaThumb from "./MediaThumb.vue";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";

type MediaField = Extract<Field, { type: "image" | "file" }>;

const props = defineProps<{ field: MediaField; invalid?: boolean }>();
const model = defineModel<string | string[] | null>();
const { t } = useI18n();
const ids = computed(() => (model.value == null ? [] : ([] as string[]).concat(model.value)));
const docs = ref<Record<string, MediaRead | null>>({});
const open = ref(false);
const fileInput = ref<HTMLInputElement>();

watch(
  ids,
  (list) => {
    for (const id of list)
      if (!(id in docs.value))
        client.findById("media", id).then(
          (d) => (docs.value[id] = d as MediaRead),
          () => (docs.value[id] = null),
        );
  },
  { immediate: true },
);

function set(list: string[]) {
  model.value = props.field.many ? list : (list.at(-1) ?? null);
}

// The dragged position, and where it would drop. `at` is `null` where the drop changes nothing.
const dragged = ref<number | null>(null);
const at = ref<number | null>(null);
const list = ref<HTMLElement>();

function dragStart(e: DragEvent, i: number) {
  const row = (e.target as HTMLElement).closest("li");
  if (row) e.dataTransfer?.setDragImage(row, 0, 0);
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    // Firefox starts a drag only with data.
    e.dataTransfer.setData("application/x-tenon-media", ids.value[i]!);
  }
  dragged.value = i;
}

// Other drags, like a block of an outer list, pass through.
function dragOver(e: DragEvent, i: number) {
  const from = dragged.value;
  if (from === null) return;
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
  at.value = index === from || index === from + 1 ? null : index;
}

function drop(e: DragEvent) {
  const from = dragged.value;
  if (from === null) return;
  e.preventDefault();
  e.stopPropagation();
  if (at.value !== null) set(moveItem(ids.value, from, at.value > from ? at.value - 1 : at.value));
  dragEnd();
}

function dragEnd() {
  dragged.value = at.value = null;
}

// The arrow keys on the handle move the file and keep the focus on it.
async function shift(i: number, by: number) {
  if (!ids.value[i + by]) return;
  set(moveItem(ids.value, i, i + by));
  await nextTick();
  list.value?.querySelectorAll<HTMLElement>("[data-handle]")[i + by]?.focus();
}
// Keeps the order of files already chosen and appends new ones.
function confirm(picked: string[]) {
  const kept = ids.value.filter((id) => picked.includes(id));
  set([...kept, ...picked.filter((id) => !kept.includes(id))]);
}

async function upload(files: FileList | null) {
  const uploaded = await uploadFiles(files, { folder: props.field.folder, rules: props.field });
  if (!uploaded.length) return;
  for (const doc of uploaded) docs.value[doc.id] = doc;
  set([...(props.field.many ? ids.value : []), ...uploaded.map((doc) => doc.id)]);
}
</script>

<template>
  <div class="flex flex-col gap-3" :aria-invalid="invalid">
    <ul
      v-if="ids.length"
      ref="list"
      class="border-border divide-border divide-y overflow-hidden rounded-md border"
      @drop="drop"
    >
      <template v-for="(id, i) in ids" :key="id">
        <li v-if="at === i" class="p-1" @dragover.prevent.stop>
          <div class="border-ring bg-accent h-16 rounded-sm border-2 border-dashed" />
        </li>
        <li
          class="flex items-center gap-3 p-3 data-[dragging=true]:opacity-50"
          :class="field.many && !field.readOnly && 'pl-1'"
          :data-dragging="dragged === i"
          @dragover="dragOver($event, i)"
        >
          <span
            v-if="field.many && !field.readOnly"
            data-handle
            role="button"
            tabindex="0"
            draggable="true"
            class="text-muted-foreground focus-visible:ring-ring/50 flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md outline-none focus-visible:ring-3"
            :aria-label="t('media.reorder', { name: docs[id]?.filename ?? id })"
            @dragstart="dragStart($event, i)"
            @dragend="dragEnd"
            @keydown.up.prevent="shift(i, -1)"
            @keydown.down.prevent="shift(i, 1)"
          >
            <Icon name="grip-vertical" />
          </span>
          <MediaThumb :doc="docs[id]" sizes="3rem" class="size-12" />
          <RouterLink
            :to="{
              path: docs[id]?.folder ? `${CONTENT}/media/${docs[id].folder}` : `${CONTENT}/media`,
              query: { file: id },
            }"
            class="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
          >
            {{ docs[id]?.filename ?? (docs[id] === null ? t("media.missingFile") : "…") }}
          </RouterLink>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="field.readOnly"
            @click="set(ids.filter((x) => x !== id))"
          >
            {{ t("common.remove") }}
          </Button>
        </li>
      </template>
      <li v-if="at === ids.length" class="p-1" @dragover.prevent.stop>
        <div class="border-ring bg-accent h-16 rounded-sm border-2 border-dashed" />
      </li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" :disabled="field.readOnly" @click="open = true">
        {{ t("media.choose") }}
      </Button>
      <Button
        type="button"
        variant="outline"
        :disabled="field.readOnly"
        @click="fileInput?.click()"
      >
        {{ t("media.uploadNew") }}
      </Button>
      <input
        ref="fileInput"
        type="file"
        class="hidden"
        :multiple="field.many"
        :accept="
          (field.accept ?? (field.type === 'image' ? ['image/*'] : [])).join(',') || undefined
        "
        @change="
          upload(($event.target as HTMLInputElement).files);
          ($event.target as HTMLInputElement).value = '';
        "
      />
    </div>
    <MediaPicker v-model:open="open" :field="field" :selected="ids" @select="confirm" />
  </div>
</template>
