<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { client, CmsError, type MediaRead } from "@/shared/api";
import { formatSize } from "@/modules/media/media";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useBreadcrumb } from "@/shared/composables/useBreadcrumbs";

type Reference = { collection: string; id: string } | { global: string };

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const doc = ref<MediaRead | null>(null);
const form = ref({ alt: "", filename: "", folder: "" });
const folders = ref<string[]>([]);
const errors = ref<Record<string, string>>({});
const error = ref("");
const saved = ref(false);
const busy = ref(false);
const copied = ref(false);
const references = ref<Reference[]>([]);
const kind = computed(() => doc.value?.mimeType.split("/")[0]);

useHead({ title: () => doc.value?.filename ?? "Media" });
useBreadcrumb(() => doc.value?.filename);

function show(d: MediaRead) {
  doc.value = d;
  form.value = { alt: d.alt ?? "", filename: d.filename, folder: d.folder };
}
client.findById("media", id).then(
  (d) => show(d as MediaRead),
  () => (error.value = "Not found"),
);
client.media.folders().then((f) => (folders.value = f));

async function save() {
  busy.value = true;
  errors.value = {};
  error.value = "";
  saved.value = false;
  try {
    show(await client.media.update(id, { ...form.value, alt: form.value.alt || null }));
    saved.value = true;
  } catch (e) {
    errors.value = (e instanceof CmsError && e.body?.errors) || {};
    error.value = errors.value[""] ?? (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  error.value = "";
  references.value = [];
  try {
    await client.media.delete(id);
    await router.push(doc.value?.folder ? `/media/${doc.value.folder}` : "/media");
  } catch (e) {
    if (e instanceof CmsError && e.status === 409) references.value = e.body.references;
    else error.value = (e as Error).message;
  }
}

async function copy() {
  await navigator.clipboard.writeText(new URL(doc.value!.url, location.href).href);
  copied.value = true;
}

const referenceLink = (r: Reference) =>
  "global" in r ? `/globals/${r.global}` : `/collections/${r.collection}/${r.id}`;
</script>

<template>
  <RouterLink
    :to="doc?.folder ? `/media/${doc.folder}` : '/media'"
    class="text-muted-foreground text-sm"
  >
    ← Media
  </RouterLink>
  <p v-if="!doc && error" class="mt-4 text-sm text-red-600" role="alert">{{ error }}</p>
  <div v-if="doc" class="mt-1 flex flex-col gap-6">
    <h1 class="text-2xl font-semibold">{{ doc.filename }}</h1>
    <div class="flex flex-wrap gap-8">
      <div class="w-full max-w-xl">
        <img
          v-if="kind === 'image'"
          :src="doc.url"
          :alt="doc.alt ?? ''"
          class="border-border bg-card max-h-[60vh] rounded-lg border"
        />
        <video v-else-if="kind === 'video'" :src="doc.url" controls class="w-full rounded-lg" />
        <audio v-else-if="kind === 'audio'" :src="doc.url" controls class="w-full" />
        <a v-else :href="doc.url" download class="btn inline-block">Download</a>
      </div>

      <form class="flex w-full max-w-sm flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-1">
          <Label for="alt">Alt text</Label>
          <Input id="alt" v-model="form.alt" :aria-invalid="errors.alt ? true : undefined" />
          <span v-if="errors.alt" class="text-xs text-red-600" role="alert">{{ errors.alt }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <Label for="filename">Filename</Label>
          <Input
            id="filename"
            v-model="form.filename"
            required
            :aria-invalid="errors.filename ? true : undefined"
          />
          <span v-if="errors.filename" class="text-xs text-red-600" role="alert">{{
            errors.filename
          }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <Label for="folder">Folder</Label>
          <Input
            id="folder"
            v-model="form.folder"
            list="media-folders"
            placeholder="Root"
            :aria-invalid="errors.folder ? true : undefined"
          />
          <datalist id="media-folders">
            <option v-for="f in folders" :key="f" :value="f" />
          </datalist>
          <small class="text-muted-foreground text-xs">Pick a folder or type a new path.</small>
          <span v-if="errors.folder" class="text-xs text-red-600" role="alert">{{
            errors.folder
          }}</span>
        </div>

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Type</dt>
          <dd>{{ doc.mimeType }}</dd>
          <dt class="text-muted-foreground">Size</dt>
          <dd>{{ formatSize(doc.size) }}</dd>
          <template v-if="doc.width">
            <dt class="text-muted-foreground">Dimensions</dt>
            <dd>{{ doc.width }} × {{ doc.height }}</dd>
          </template>
          <dt class="text-muted-foreground">URL</dt>
          <dd class="flex min-w-0 items-center gap-2">
            <a :href="doc.url" class="truncate underline" target="_blank">{{ doc.url }}</a>
            <button type="button" class="btn-ghost shrink-0" @click="copy">
              {{ copied ? "Copied" : "Copy" }}
            </button>
          </dd>
        </dl>

        <div class="flex items-center gap-3">
          <button class="btn" :disabled="busy">Save</button>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <button type="button" class="btn-ghost text-red-600">Delete</button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {{ doc.filename }}?</AlertDialogTitle>
                <AlertDialogDescription
                  >The file is removed from storage. This cannot be undone.</AlertDialogDescription
                >
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" @click="remove">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span v-if="saved" class="text-sm text-green-700" role="status">Saved</span>
          <span v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</span>
        </div>

        <div v-if="references.length" class="text-sm text-red-600" role="alert">
          <p>This file is still used by:</p>
          <ul class="list-disc pl-5">
            <li v-for="r in references" :key="referenceLink(r)">
              <RouterLink :to="referenceLink(r)" class="underline">
                {{ "global" in r ? r.global : `${r.collection} ${r.id}` }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </form>
    </div>
  </div>
</template>
