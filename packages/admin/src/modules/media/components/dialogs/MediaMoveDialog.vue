<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { folderContains } from "../../../../../../core/src/media/library/selection";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

const props = defineProps<{
  folders: string[];
  selectedFolders: string[];
  count: number;
  busy: boolean;
  validDestination: boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const destination = defineModel<string>("destination", { required: true });
const emit = defineEmits<{ submit: [] }>();
const { t } = useI18n();

function submit() {
  if (!props.busy && props.validDestination) emit("submit");
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("media.moveSelectedTitle", { count }) }}</DialogTitle>
        <DialogDescription>{{ t("media.moveSelectedText") }}</DialogDescription>
      </DialogHeader>
      <form id="media-move" class="space-y-2" @submit.prevent="submit">
        <Label for="media-destination">{{ t("media.destinationFolder") }}</Label>
        <NativeSelect id="media-destination" v-model="destination" class="w-full" :disabled="busy">
          <NativeSelectOption value="">{{ t("media.root") }}</NativeSelectOption>
          <NativeSelectOption
            v-for="path in folders"
            :key="path"
            :value="path"
            :disabled="selectedFolders.some((folder) => folderContains(folder, path))"
            >{{ path }}</NativeSelectOption
          >
        </NativeSelect>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="open = false">{{
          t("common.cancel")
        }}</Button>
        <Button type="submit" form="media-move" :disabled="busy || !validDestination">{{
          t("media.move")
        }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
