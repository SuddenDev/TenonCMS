<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { client, CmsError, type MediaRead } from "@/shared/api";
import { DeletionCancelled, withLinkedDeletion } from "@/shared/linked-deletion";
import MediaBottomBar from "./MediaBottomBar.vue";
import MediaDeleteDialog from "./dialogs/MediaDeleteDialog.vue";
import MediaMoveDialog from "./dialogs/MediaMoveDialog.vue";
import {
  folderContains,
  moveDestination,
  selectedMedia,
} from "../../../../../core/src/media/library/selection";

const props = withDefaults(
  defineProps<{
    files: MediaRead[];
    folders: string[];
    folder: string;
    itemCount: number;
    showSelection?: boolean;
  }>(),
  { showSelection: true },
);
const selected = defineModel<string[]>("selected", { required: true });
const selectedFolders = defineModel<string[]>("selectedFolders", { default: () => [] });
const busy = defineModel<boolean>("busy", { default: false });
const emit = defineEmits<{
  changed: [];
  selectAll: [];
  completedFolders: [action: "move" | "delete", folders: string[], destination: string];
}>();
const { t } = useI18n();
const moveOpen = ref(false);
const deleteOpen = ref(false);
const target = ref({ ids: [] as string[], folders: [] as string[] });
const targetCount = computed(() => target.value.ids.length + target.value.folders.length);
const destination = ref("");
const job = ref({ done: 0, total: 0 });
const validDestination = computed(
  () =>
    destination.value !== props.folder &&
    !target.value.folders.some((folder) => folderContains(folder, destination.value)),
);

function clear() {
  selected.value = [];
  selectedFolders.value = [];
}

watch(
  () => props.folder,
  () => {
    moveOpen.value = false;
  },
);

function move(ids = selected.value, folders = selectedFolders.value) {
  target.value = { ids: [...ids], folders: [...folders] };
  destination.value = props.folder;
  moveOpen.value = true;
}

function remove(ids = selected.value, folders = selectedFolders.value) {
  target.value = { ids: [...ids], folders: [...folders] };
  deleteOpen.value = true;
}

defineExpose({ move, remove });

async function run(action: "move" | "delete") {
  if (busy.value || !targetCount.value || (action === "move" && !validDestination.value)) return;
  const roots = [...target.value.folders];
  const files = selectedMedia(props.files, target.value.ids, roots);
  const folder = destination.value;
  moveOpen.value = false;
  busy.value = true;
  job.value = { done: 0, total: files.length };
  let succeeded = 0;
  const completed = new Set<string>();

  try {
    for (const file of files) {
      try {
        if (action === "move")
          await client.media.update(file.id, {
            folder: moveDestination(file.folder, roots, folder),
          });
        else await withLinkedDeletion((options) => client.media.delete(file.id, options));
        selected.value = selected.value.filter((id) => id !== file.id);
        succeeded++;
        completed.add(file.id);
      } catch (error) {
        if (error instanceof DeletionCancelled) break;
        toast.error(roots.length ? `${file.folder}/${file.filename}` : file.filename, {
          description:
            error instanceof CmsError && error.body?.errors
              ? Object.values(error.body.errors).join("; ")
              : (error as Error).message,
        });
      } finally {
        job.value.done++;
      }
    }
  } finally {
    const completedFolders = roots.filter((root) =>
      files
        .filter((file) => folderContains(root, file.folder))
        .every((file) => completed.has(file.id)),
    );
    selectedFolders.value = selectedFolders.value.filter(
      (root) => !completedFolders.includes(root),
    );
    emit("completedFolders", action, completedFolders, folder);
    busy.value = false;
    if (succeeded === files.length)
      toast.success(
        files.length
          ? t(action === "move" ? "media.movedCount" : "media.deletedCount", { count: succeeded })
          : t("media.foldersProcessed"),
      );
    emit("changed");
  }
}
</script>

<template>
  <MediaBottomBar
    :selected="selected"
    :selected-folders="selectedFolders"
    :item-count="itemCount"
    :show-selection="showSelection"
    :busy="busy"
    :job="job"
    @select-all="emit('selectAll')"
    @clear="clear"
    @move="move()"
    @delete="remove()"
  />
  <MediaDeleteDialog
    v-model:open="deleteOpen"
    :count="targetCount"
    :disabled="busy"
    @confirm="run('delete')"
  />
  <MediaMoveDialog
    v-model:open="moveOpen"
    v-model:destination="destination"
    :count="targetCount"
    :folders="folders"
    :selected-folders="target.folders"
    :busy="busy"
    :valid-destination="validDestination"
    @submit="run('move')"
  />
</template>
