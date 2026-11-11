<script setup lang="ts">
import { can } from "@/shared/access";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, CmsError, schema, type MediaRead } from "@/shared/api";
import { childFolders, fits, selectRange, type MediaRules } from "@/modules/media/media";
import { useActiveElement, useStorage } from "@vueuse/core";
import { defineShortcuts } from "@/shared/composables/defineShortcuts";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { uploadFiles } from "../uploads";
import Icon from "@/shared/components/Icon.vue";
import MediaActions from "./MediaActions.vue";
import MediaFolderItem from "./MediaFolderItem.vue";
import MediaFileItem from "./MediaFileItem.vue";
import MediaRenameDialog from "./dialogs/MediaRenameDialog.vue";
import MediaNewFolderDialog from "./dialogs/MediaNewFolderDialog.vue";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { Button } from "@/shared/components/ui/button";
import { cleanFolder, cleanName } from "../../../../../core/src/media/library/names";
import { folderContains, moveDestination } from "../../../../../core/src/media/library/selection";
import { useFileHandler, type FileWithPath } from "../composables/useFileHandler";
import { useDropZone } from "../composables/useDropZone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const props = defineProps<{ pick?: MediaRules & { many?: boolean } }>();
const folder = defineModel<string>("folder", { default: "" });
const selected = defineModel<string[]>("selected", { default: () => [] });
const emit = defineEmits<{ open: [id: string] }>();
const { t, locale } = useI18n();

const docs = ref<MediaRead[]>([]);
const folders = ref<string[]>([]);
// Empty folders exist locally until the first upload.
const localFolders = ref<string[]>([]);
const loading = ref(true);
const error = ref("");
const selectionBusy = ref(false);
const selectedFolders = ref<string[]>([]);
const actions = ref<InstanceType<typeof MediaActions>>();
const renameTarget = ref<MediaRead | string | null>(null);
const renameOpen = ref(false);
const renameError = ref("");
const renameName = computed(() =>
  typeof renameTarget.value === "string"
    ? renameTarget.value.split("/").at(-1)!
    : (renameTarget.value?.filename ?? ""),
);
const newFolderOpen = ref(false);
const newFolderError = ref("");
const dropTarget = ref<HTMLElement>();
const fileHandler = useFileHandler({ onFilesReady: upload });
const { error: fileError, openFileDialog, openDirectoryDialog } = fileHandler;
const { isOverDropZone, isReading, error: dropError } = useDropZone(dropTarget, fileHandler);
const view = useStorage<"grid" | "list">("tenon-media-view", "grid", undefined, {
  onError: () => {},
});
const list = computed(() => view.value === "list");
const many = computed(() => !props.pick || !!props.pick.many);
// The last clicked file or folder, where Shift+click starts its range.
const anchor = ref<string>();
const pickerAccept = computed(() =>
  (props.pick?.accept ?? (props.pick?.type === "image" ? ["image/*"] : [])).join(","),
);

async function load() {
  error.value = "";
  loading.value = true;
  try {
    // shortcut: loads the whole library, add paging when libraries grow large.
    const [files, paths] = await Promise.all([
      client.find("media", { populate: false }) as Promise<MediaRead[]>,
      client.media.folders(),
    ]);
    docs.value = files;
    folders.value = paths;
    selected.value = selected.value.filter((id) =>
      files.some((file) => file.id === id && (props.pick || file.folder === folder.value)),
    );
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
load();
defineExpose({ load, renameFolder });

async function renameFolder(input: string, from = folder.value) {
  const to = cleanFolder(input);
  const result = await client.media.renameFolder(from, to);
  if (!result.failed.length) {
    localFolders.value = localFolders.value
      .map((path) =>
        path === from || path.startsWith(`${from}/`)
          ? [to, path.slice(from.length + 1)].filter(Boolean).join("/")
          : path,
      )
      .filter(Boolean);
    selectedFolders.value = selectedFolders.value.map((path) =>
      folderContains(from, path) ? to + path.slice(from.length) : path,
    );
    if (folder.value === from) folder.value = to;
  }
  await load();
  return result;
}

const visibleFolders = computed(() =>
  childFolders([...folders.value, ...localFolders.value], folder.value),
);
const currentFiles = computed(() =>
  docs.value
    .filter((d) => d.folder === folder.value)
    .sort((a, b) => a.filename.localeCompare(b.filename, locale.value, { numeric: true })),
);
const breadcrumbs = computed(() =>
  folder.value
    ? folder.value.split("/").map((name, i, all) => ({ name, path: all.slice(0, i + 1).join("/") }))
    : [],
);
const allowed = (d: MediaRead) => !props.pick || fits(props.pick, d);

watch(folder, () => {
  if (!props.pick) selected.value = [];
  selectedFolders.value = [];
});

const isSelecting = (e: MouseEvent) => e.shiftKey || e.metaKey || e.ctrlKey;

function selectFolder(path: string, e?: MouseEvent) {
  if (e?.shiftKey) {
    const order = visibleFolders.value.map((folder) => folder.path);
    selectedFolders.value = selectRange(order, selectedFolders.value, anchor.value, path);
  } else
    selectedFolders.value = selectedFolders.value.includes(path)
      ? selectedFolders.value.filter((folder) => folder !== path)
      : [...selectedFolders.value, path];
  anchor.value = path;
}

function clickFolder(path: string, e: MouseEvent) {
  if (!props.pick && isSelecting(e)) selectFolder(path, e);
  else folder.value = path;
}

function selectFile(d: MediaRead, e: MouseEvent) {
  if (!many.value || !e.shiftKey) return choose(d);
  const order = currentFiles.value.filter(allowed).map((file) => file.id);
  selected.value = selectRange(order, selected.value, anchor.value, d.id);
  anchor.value = d.id;
}

function clickFile(d: MediaRead, e: MouseEvent) {
  if (props.pick || isSelecting(e)) selectFile(d, e);
  else emit("open", d.id);
}

/** Pickers keep selections from other folders, so they add the folder's allowed files. */
function selectAll() {
  const ids = currentFiles.value.filter(allowed).map((file) => file.id);
  if (props.pick) return void (selected.value = [...new Set([...selected.value, ...ids])]);
  selected.value = ids;
  selectedFolders.value = visibleFolders.value.map((folder) => folder.path);
}

function clearSelection() {
  selected.value = [];
  selectedFolders.value = [];
}

const focused = useActiveElement();
const selectionCount = computed(() => selected.value.length + selectedFolders.value.length);
// Shortcuts stay off while focus is in a dialog or sheet above the library.
const hasFocus = computed(
  () =>
    !focused.value ||
    focused.value === document.body ||
    !!dropTarget.value?.contains(focused.value),
);
defineShortcuts(() => {
  if (!hasFocus.value || selectionBusy.value) return {};
  const removeSelected = !props.pick && selectionCount.value > 0 && (() => actions.value?.remove());
  return {
    meta_a: many.value && selectAll,
    escape: !props.pick && selectionCount.value > 0 && clearSelection,
    meta_backspace: removeSelected,
    delete: removeSelected,
  };
});

function completedFolders(action: "move" | "delete", roots: string[], destination: string) {
  localFolders.value = localFolders.value.flatMap((path) => {
    if (!roots.some((root) => folderContains(root, path))) return [path];
    return action === "move" ? [moveDestination(path, roots, destination)] : [];
  });
}

function startRename(item: MediaRead | string) {
  renameTarget.value = item;
  renameError.value = "";
  renameOpen.value = true;
}

async function renameItem(input: string) {
  const item = renameTarget.value;
  if (!item || selectionBusy.value) return;
  renameError.value = "";
  selectionBusy.value = true;
  try {
    const filename = cleanName(input);
    if (typeof item === "string") {
      const parent = item.includes("/") ? item.slice(0, item.lastIndexOf("/")) : "";
      const result = await renameFolder([parent, filename].filter(Boolean).join("/"), item);
      if (result.failed.length) {
        renameError.value = `${t("media.notMoved")} ${result.failed.map((file) => `${file.id}: ${file.message}`).join("; ")}`;
        return;
      }
    } else {
      await client.media.update(item.id, { filename });
      await load();
    }
    renameOpen.value = false;
  } catch (e) {
    renameError.value =
      (e instanceof CmsError && e.body?.errors && Object.values(e.body.errors).join("; ")) ||
      (e as Error).message;
  } finally {
    selectionBusy.value = false;
  }
}

function startNewFolder() {
  newFolderError.value = "";
  newFolderOpen.value = true;
}

function newFolder(input: string) {
  const name = input.trim().replace(/^\/+|\/+$/g, "");
  if (!name) return;
  try {
    const path = cleanFolder([folder.value, name].filter(Boolean).join("/"));
    localFolders.value.push(path);
    newFolderOpen.value = false;
    folder.value = path;
  } catch (e) {
    newFolderError.value = (e as Error).message;
  }
}

function choose(d: MediaRead) {
  if (!allowed(d)) return;
  if (selected.value.includes(d.id)) selected.value = selected.value.filter((id) => id !== d.id);
  else if (!many.value) selected.value = [d.id];
  else selected.value = [...selected.value, d.id];
  anchor.value = d.id;
}

// New folders exist only until their first upload, so they go with it.
const uploads = computed(() => can(schema.value.collections?.media, "create"));

async function upload(files: Iterable<FileWithPath> | null | undefined) {
  if (!uploads.value) return;
  const uploaded = await uploadFiles(files, { folder: folder.value, rules: props.pick });
  for (const doc of uploaded) {
    docs.value = [doc, ...docs.value];
    if (props.pick) choose(doc);
  }
  if (uploaded.length) await load();
}
</script>

<template>
  <div
    ref="dropTarget"
    data-slot="media-library"
    class="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
    :aria-busy="loading || isReading"
  >
    <div
      v-if="isOverDropZone"
      class="border-primary bg-background/90 pointer-events-none absolute inset-0 z-20 flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center"
      role="status"
    >
      <Icon name="upload" class="text-3xl" />
      <p class="text-sm font-medium">{{ t("media.dropFiles") }}</p>
    </div>

    <header
      class="border-border flex shrink-0 flex-wrap items-center justify-between gap-4 border-b p-4 sm:px-6"
    >
      <div class="min-w-0 flex-1">
        <h1 v-if="!pick" class="mb-2 text-2xl font-semibold">{{ t("nav.media") }}</h1>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage v-if="!folder">{{ t("media.allFiles") }}</BreadcrumbPage>
              <BreadcrumbLink
                v-else
                as="button"
                type="button"
                :disabled="selectionBusy"
                @click="folder = ''"
                >{{ t("media.allFiles") }}</BreadcrumbLink
              >
            </BreadcrumbItem>
            <template v-for="(c, i) in breadcrumbs" :key="c.path">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage v-if="i === breadcrumbs.length - 1">{{ c.name }}</BreadcrumbPage>
                <BreadcrumbLink
                  v-else
                  as="button"
                  type="button"
                  :disabled="selectionBusy"
                  @click="folder = c.path"
                  >{{ c.name }}</BreadcrumbLink
                >
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div class="-mr-2 flex flex-wrap items-center justify-end gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          required
          :model-value="view"
          :aria-label="t('media.view')"
          @update:model-value="(value) => (view = value === 'list' ? 'list' : 'grid')"
        >
          <ToggleGroupItem value="grid" :aria-label="t('media.grid')">
            <Icon name="layout-grid" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" :aria-label="t('media.list')">
            <Icon name="list" />
          </ToggleGroupItem>
        </ToggleGroup>
        <slot name="actions" />
        <Button
          v-if="uploads"
          type="button"
          variant="outline"
          :disabled="selectionBusy"
          @click="startNewFolder"
        >
          <Icon name="folder-plus" />
          {{ t("media.newFolder") }}
        </Button>
        <DropdownMenu v-if="uploads">
          <DropdownMenuTrigger as-child>
            <Button type="button" :disabled="selectionBusy"
              ><Icon name="upload" />{{ t("media.upload") }}<Icon name="chevron-down"
            /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="openFileDialog({ accept: pickerAccept })"
              ><Icon name="file-plus" />{{ t("media.uploadFiles") }}</DropdownMenuItem
            >
            <DropdownMenuItem @select="openDirectoryDialog()"
              ><Icon name="folder-plus" />{{ t("media.uploadFolder") }}</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
        <slot name="actions-end" />
      </div>
    </header>

    <div
      data-slot="media-library-content"
      class="@container min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6"
    >
      <slot name="status" />
      <p v-if="dropError || fileError" class="text-destructive text-sm" role="alert">
        {{ (dropError || fileError)?.message }}
      </p>
      <p v-if="isReading" class="text-muted-foreground text-sm" role="status">
        {{ t("media.readingFiles") }}
      </p>

      <div v-if="error" class="text-destructive flex items-center gap-3 text-sm" role="alert">
        {{ error }}
        <Button type="button" variant="outline" size="sm" @click="load">{{
          t("common.retry")
        }}</Button>
      </div>

      <p
        v-if="loading && !docs.length"
        class="text-muted-foreground py-12 text-center text-sm"
        role="status"
      >
        {{ t("common.loading") }}
      </p>

      <section
        v-if="visibleFolders.length"
        :aria-label="t('media.folders')"
        class="flex flex-col gap-3"
      >
        <h2 class="text-muted-foreground text-xs font-medium">{{ t("media.folders") }}</h2>
        <ul
          class="select-none"
          :class="
            list
              ? 'flex flex-col gap-1'
              : 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))] gap-2 @2xl:gap-3'
          "
        >
          <MediaFolderItem
            v-for="f in visibleFolders"
            :key="f.path"
            :folder="f"
            :selected="selectedFolders.includes(f.path)"
            :pick="!!pick"
            :disabled="selectionBusy"
            @open="clickFolder(f.path, $event)"
            @select="selectFolder(f.path, $event)"
            @rename="startRename(f.path)"
            @move="actions?.move([], [f.path])"
            @delete="actions?.remove([], [f.path])"
          />
        </ul>
      </section>

      <section
        v-if="currentFiles.length"
        :aria-label="t('media.files')"
        class="flex flex-col gap-3"
      >
        <h2 class="text-muted-foreground text-xs font-medium">{{ t("media.files") }}</h2>
        <ul
          class="select-none"
          :class="
            list
              ? 'flex flex-col gap-1'
              : 'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 @2xl:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] @2xl:gap-3'
          "
        >
          <MediaFileItem
            v-for="d in currentFiles"
            :key="d.id"
            :doc="d"
            :selected="selected.includes(d.id)"
            :allowed="allowed(d)"
            :list="list"
            :pick="!!pick"
            :disabled="selectionBusy"
            @open="clickFile(d, $event)"
            @select="selectFile(d, $event)"
            @rename="startRename(d)"
            @move="actions?.move([d.id], [])"
            @delete="actions?.remove([d.id], [])"
          />
        </ul>
      </section>
      <div
        v-if="!loading && !error && !currentFiles.length && !visibleFolders.length"
        class="border-border flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center"
      >
        <span
          class="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl text-xl"
          ><Icon name="folder-open"
        /></span>
        <p class="text-muted-foreground text-sm">{{ t("media.empty") }}</p>
      </div>
    </div>
    <MediaActions
      ref="actions"
      :selected="pick ? [] : selected"
      v-model:selected-folders="selectedFolders"
      v-model:busy="selectionBusy"
      :files="docs"
      :folders="[...new Set([...folders, ...localFolders, folder])].filter(Boolean).sort()"
      :folder="folder"
      :item-count="visibleFolders.length + currentFiles.length"
      :show-selection="!pick"
      @update:selected="!pick && (selected = $event)"
      @select-all="selectAll"
      @completed-folders="completedFolders"
      @changed="load"
    />
    <MediaRenameDialog
      v-model:open="renameOpen"
      :name="renameName"
      :label="t(typeof renameTarget === 'string' ? 'media.folderName' : 'media.filename')"
      :error="renameError"
      :busy="selectionBusy"
      @submit="renameItem"
    />
    <MediaNewFolderDialog
      v-model:open="newFolderOpen"
      :error="newFolderError"
      @submit="newFolder"
    />
  </div>
</template>
