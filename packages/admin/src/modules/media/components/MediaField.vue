<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, type Field, type MediaRead } from "@/shared/api";
import { fits } from "@/modules/media/media";
import MediaLibrary from "./MediaLibrary.vue";
import MediaThumb from "./MediaThumb.vue";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

type MediaField = Extract<Field, { type: "image" | "file" }>;

const props = defineProps<{ field: MediaField; invalid?: boolean }>();
const model = defineModel<string | string[] | null>();
const { t } = useI18n();
const ids = computed(() => (model.value == null ? [] : ([] as string[]).concat(model.value)));
const docs = ref<Record<string, MediaRead | null>>({});
const open = ref(false);
const folder = ref(props.field.folder ?? "");
const picked = ref<string[]>([]);
const error = ref("");

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
function move(i: number, by: number) {
  const list = [...ids.value];
  [list[i], list[i + by]] = [list[i + by], list[i]];
  set(list);
}
function choose() {
  picked.value = [...ids.value];
  open.value = true;
}
// Keeps the order of files already chosen and appends new ones.
function confirm() {
  const kept = ids.value.filter((id) => picked.value.includes(id));
  set([...kept, ...picked.value.filter((id) => !kept.includes(id))]);
  open.value = false;
}

async function upload(files: FileList | null) {
  error.value = "";
  for (const file of files ?? []) {
    if (!fits(props.field, { mimeType: file.type, size: file.size })) {
      error.value = t("media.notAllowedHere", { name: file.name });
      continue;
    }
    try {
      const doc = await client.media.upload(file, { folder: props.field.folder });
      docs.value[doc.id] = doc;
      set([...(props.field.many ? ids.value : []), doc.id]);
    } catch (e) {
      error.value = (e as Error).message;
    }
  }
}
</script>

<template>
  <div class="flex flex-col gap-2" :aria-invalid="invalid">
    <ul v-if="ids.length" class="flex flex-col gap-2">
      <li
        v-for="(id, i) in ids"
        :key="id"
        class="border-border bg-card flex items-center gap-3 rounded-md border p-2"
      >
        <MediaThumb :doc="docs[id]" sizes="3rem" class="size-12" />
        <RouterLink :to="`${CONTENT}/media-file/${id}`" class="flex-1 truncate text-sm underline">
          {{ docs[id]?.filename ?? (docs[id] === null ? t("media.missingFile") : "…") }}
        </RouterLink>
        <template v-if="field.many">
          <button
            type="button"
            class="btn-ghost"
            :disabled="i === 0"
            :aria-label="t('common.moveUp')"
            @click="move(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn-ghost"
            :disabled="i === ids.length - 1"
            :aria-label="t('common.moveDown')"
            @click="move(i, 1)"
          >
            ↓
          </button>
        </template>
        <button
          type="button"
          class="btn-ghost"
          :disabled="field.readOnly"
          @click="set(ids.filter((x) => x !== id))"
        >
          {{ t("common.remove") }}
        </button>
      </li>
    </ul>
    <div class="flex gap-2">
      <button
        type="button"
        class="btn-ghost border-input border"
        :disabled="field.readOnly"
        @click="choose"
      >
        {{ t("media.choose") }}
      </button>
      <label
        class="btn-ghost border-input cursor-pointer border"
        :class="field.readOnly && 'pointer-events-none opacity-50'"
      >
        {{ t("media.uploadNew") }}
        <input
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
      </label>
    </div>
    <span v-if="error" class="text-xs text-red-600" role="alert">{{ error }}</span>

    <Dialog v-model:open="open">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{{ t(field.many ? "media.chooseFiles" : "media.chooseFile") }}</DialogTitle>
        </DialogHeader>
        <MediaLibrary v-model:folder="folder" v-model:selected="picked" :pick="field" />
        <DialogFooter>
          <button type="button" class="btn" @click="confirm">
            {{ t("media.select") }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
