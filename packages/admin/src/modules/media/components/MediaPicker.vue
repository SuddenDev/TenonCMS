<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Field } from "@/shared/api";
import MediaLibrary from "./MediaLibrary.vue";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";

/** The media library as a dialog. Opening it starts from `selected`; `select` gets the picked ids. */
const props = defineProps<{
  field: Extract<Field, { type: "image" | "file" }>;
  selected: string[];
}>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ select: [ids: string[]] }>();
const { t } = useI18n();
const folder = ref(props.field.folder ?? "");
const picked = ref<string[]>([]);

watch(open, (on) => on && (picked.value = [...props.selected]));

function confirm() {
  emit("select", picked.value);
  open.value = false;
}
</script>

<template>
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
</template>
