<script setup lang="ts">
import { computed, ref } from "vue";
import { client, type MediaRead } from "@/shared/api";
import { fits, formatSize, type MediaRules } from "@/modules/media/media";
import Icon from "@/shared/components/Icon.vue";
import MediaThumb from "./MediaThumb.vue";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { Progress } from "@/shared/components/ui/progress";

// `pick`: picker mode for an image or file field. Files that do not fit it are disabled, and a click selects instead of opening.
const props = defineProps<{ pick?: MediaRules & { many?: boolean } }>();
const folder = defineModel<string>("folder", { default: "" });
const selected = defineModel<string[]>("selected", { default: () => [] });
const emit = defineEmits<{ open: [id: string] }>();

const docs = ref<MediaRead[]>([]);
const folders = ref<string[]>([]);
// Folders from "New folder". They exist only here until the first upload.
const made = ref<string[]>([]);

async function load() {
  // ponytail: loads the whole library; add paging when libraries grow large.
  [docs.value, folders.value] = await Promise.all([
    client.find("media", { populate: false }) as Promise<MediaRead[]>,
    client.media.folders(),
  ]);
}
load();
defineExpose({ load });

const tree = computed(() => [...new Set([...folders.value, ...made.value])].sort());
const here = computed(() => docs.value.filter((d) => d.folder === folder.value));
const crumbs = computed(() =>
  folder.value
    ? folder.value.split("/").map((name, i, all) => ({ name, path: all.slice(0, i + 1).join("/") }))
    : [],
);
const allowed = (d: MediaRead) => !props.pick || fits(props.pick, d);

function newFolder() {
  const name = prompt("Folder name")
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  if (!name) return;
  const path = folder.value ? `${folder.value}/${name}` : name;
  made.value.push(path);
  folder.value = path;
}

function choose(d: MediaRead) {
  if (!allowed(d)) return;
  if (!props.pick?.many) selected.value = [d.id];
  else if (selected.value.includes(d.id))
    selected.value = selected.value.filter((id) => id !== d.id);
  else selected.value = [...selected.value, d.id];
}

type Upload = {
  name: string;
  loaded: number;
  total: number;
  error?: string;
  controller: AbortController;
};
const uploads = ref<Upload[]>([]);

async function upload(files: Iterable<File> | null | undefined) {
  const started: Promise<unknown>[] = [];
  for (const file of files ?? []) {
    uploads.value.push({
      name: file.name,
      loaded: 0,
      total: file.size,
      controller: new AbortController(),
    });
    const u = uploads.value.at(-1)!;
    if (props.pick && !fits(props.pick, { mimeType: file.type, size: file.size })) {
      u.error = "Not allowed for this field";
      continue;
    }
    const done = client.media
      .upload(file, {
        folder: folder.value,
        signal: u.controller.signal,
        onProgress: ({ loaded }) => (u.loaded = loaded),
      })
      .then((doc) => {
        uploads.value = uploads.value.filter((x) => x !== u);
        docs.value = [doc, ...docs.value];
        if (props.pick) choose(doc);
      })
      .catch((e: Error) => (u.error = u.controller.signal.aborted ? "Canceled" : e.message));
    started.push(done);
  }
  // Hooks MAY change the folder, so the folder list reloads once per batch.
  if (started.length) await Promise.all(started).then(load);
}

function cancel(u: Upload) {
  if (u.error) uploads.value = uploads.value.filter((x) => x !== u);
  else u.controller.abort();
}
</script>

<template>
  <div class="flex gap-6" @dragover.prevent @drop.prevent="upload($event.dataTransfer?.files)">
    <nav class="flex w-44 shrink-0 flex-col gap-0.5 text-sm">
      <button
        type="button"
        class="hover:bg-muted flex items-center gap-2 rounded px-2 py-1 text-left"
        :class="!folder && 'bg-muted font-medium'"
        @click="folder = ''"
      >
        <Icon name="folder" /> All files
      </button>
      <button
        v-for="f in tree"
        :key="f"
        type="button"
        class="hover:bg-muted flex items-center gap-2 truncate rounded py-1 pr-2 text-left"
        :class="f === folder && 'bg-muted font-medium'"
        :style="{ paddingLeft: `${0.5 + f.split('/').length * 0.75}rem` }"
        @click="folder = f"
      >
        <Icon name="folder" /> {{ f.split("/").at(-1) }}
      </button>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <Breadcrumb class="mr-auto">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage v-if="!folder">All files</BreadcrumbPage>
              <BreadcrumbLink v-else as="button" type="button" @click="folder = ''"
                >All files</BreadcrumbLink
              >
            </BreadcrumbItem>
            <template v-for="(c, i) in crumbs" :key="c.path">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage v-if="i === crumbs.length - 1">{{ c.name }}</BreadcrumbPage>
                <BreadcrumbLink v-else as="button" type="button" @click="folder = c.path">{{
                  c.name
                }}</BreadcrumbLink>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>
        <slot name="actions" />
        <button type="button" class="btn-ghost" @click="newFolder">New folder</button>
        <label class="btn cursor-pointer">
          Upload
          <input
            type="file"
            multiple
            class="hidden"
            @change="
              upload(($event.target as HTMLInputElement).files);
              ($event.target as HTMLInputElement).value = '';
            "
          />
        </label>
      </div>

      <ul v-if="uploads.length" class="flex flex-col gap-2">
        <li v-for="(u, i) in uploads" :key="i" class="flex items-center gap-3 text-sm">
          <span class="w-48 truncate">{{ u.name }}</span>
          <span v-if="u.error" class="flex-1 text-red-600" role="alert">{{ u.error }}</span>
          <Progress v-else class="flex-1" :model-value="u.total ? (u.loaded / u.total) * 100 : 0" />
          <button type="button" class="btn-ghost" @click="cancel(u)">
            {{ u.error ? "Dismiss" : "Cancel" }}
          </button>
        </li>
      </ul>

      <ul class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        <li v-for="d in here" :key="d.id">
          <button
            type="button"
            class="border-border bg-card hover:border-input flex w-full flex-col gap-1 rounded-lg border p-2 text-left disabled:opacity-40"
            :class="selected.includes(d.id) && 'ring-primary ring-2'"
            :disabled="!allowed(d)"
            :aria-pressed="pick ? selected.includes(d.id) : undefined"
            @click="pick ? choose(d) : emit('open', d.id)"
          >
            <MediaThumb :doc="d" sizes="9rem" class="aspect-square w-full" />
            <span class="truncate text-xs">{{ d.filename }}</span>
            <span class="text-muted-foreground text-xs">{{ formatSize(d.size) }}</span>
          </button>
        </li>
        <li v-if="!here.length" class="text-muted-foreground col-span-full text-sm">
          Nothing here yet. Drop files to upload.
        </li>
      </ul>
    </div>
  </div>
</template>
