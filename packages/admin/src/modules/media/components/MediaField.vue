<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, type Field, type MediaRead } from "@/shared/api";
import { uploadFiles } from "../uploads";
import MediaLibrary from "./MediaLibrary.vue";
import MediaThumb from "./MediaThumb.vue";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";

type MediaField = Extract<Field, { type: "image" | "file" }>;

const props = defineProps<{ field: MediaField; invalid?: boolean }>();
const model = defineModel<string | string[] | null>();
const { t } = useI18n();
const ids = computed(() => (model.value == null ? [] : ([] as string[]).concat(model.value)));
const docs = ref<Record<string, MediaRead | null>>({});
const open = ref(false);
const folder = ref(props.field.folder ?? "");
const picked = ref<string[]>([]);
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
      class="border-border divide-border divide-y overflow-hidden rounded-md border"
    >
      <li v-for="(id, i) in ids" :key="id" class="flex items-center gap-3 p-3">
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
        <template v-if="field.many">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="i === 0"
            :aria-label="t('common.moveUp')"
            @click="move(i, -1)"
          >
            <Icon name="arrow-up" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="i === ids.length - 1"
            :aria-label="t('common.moveDown')"
            @click="move(i, 1)"
          >
            <Icon name="arrow-down" />
          </Button>
        </template>
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
    </ul>
    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" :disabled="field.readOnly" @click="choose">
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
    <Dialog v-model:open="open">
      <DialogContent
        class="flex h-[min(85svh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        :aria-describedby="undefined"
        :show-close-button="false"
      >
        <DialogTitle class="sr-only">{{
          t(field.many ? "media.chooseFiles" : "media.chooseFile")
        }}</DialogTitle>
        <MediaLibrary
          v-model:folder="folder"
          v-model:selected="picked"
          :pick="field"
          class="min-h-0 flex-1"
        >
          <template #actions-end>
            <DialogClose as-child>
              <Button type="button" variant="ghost" size="icon" :aria-label="t('common.close')">
                <Icon name="x" />
              </Button>
            </DialogClose>
          </template>
        </MediaLibrary>
        <DialogFooter
          class="border-border m-0 shrink-0 items-center rounded-b-xl border-t px-6 py-4 sm:flex-row"
        >
          <span class="text-muted-foreground mr-auto text-sm" role="status">{{
            t("media.selectedCount", { count: picked.length })
          }}</span>
          <Button type="button" variant="outline" @click="open = false">{{
            t("common.cancel")
          }}</Button>
          <Button type="button" @click="confirm">
            {{ t("media.select") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
