<script setup lang="ts">
import { can } from "@/shared/access";
import { withLinkedDeletion, DeletionCancelled } from "@/shared/linked-deletion";
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { client, CmsError, schema, type MediaRead } from "@/shared/api";
import { fileIcon, formatSize, mediaDownload } from "@/modules/media/media";
import Icon from "@/shared/components/Icon.vue";
import { SheetHeader, SheetTitle, SheetFooter } from "@/shared/components/ui/sheet";
import MediaDeleteDialog from "../components/dialogs/MediaDeleteDialog.vue";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";

type Reference = { collection: string; id: string } | { global: string };

const { t, locale } = useI18n();
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ saved: []; deleted: [] }>();
const doc = ref<MediaRead | null>(null);
const form = ref({ alt: "", filename: "", folder: "" });
const folders = ref<string[]>([]);
const errors = ref<Record<string, string>>({});
const error = ref("");
const saved = ref(false);
const busy = ref(false);
const copied = ref(false);
const references = ref<Reference[]>([]);
const loading = ref(true);
const kind = computed(() => doc.value?.mimeType.split("/")[0]);

useHead({ title: () => doc.value?.filename ?? t("nav.media") });

function show(d: MediaRead) {
  doc.value = d;
  form.value = { alt: d.alt ?? "", filename: d.filename, folder: d.folder };
}
client
  .findById("media", props.id)
  .then(
    (d) => show(d as MediaRead),
    (e) =>
      (error.value =
        e instanceof CmsError && e.status === 404 ? t("media.notFound") : (e as Error).message),
  )
  .finally(() => (loading.value = false));
client.media.folders().then(
  (f) => (folders.value = f),
  (e) => (error.value = (e as Error).message),
);

async function save() {
  busy.value = true;
  errors.value = {};
  error.value = "";
  saved.value = false;

  try {
    show(await client.media.update(props.id, { ...form.value, alt: form.value.alt || null }));
    saved.value = true;
    emit("saved");
  } catch (e) {
    errors.value = (e instanceof CmsError && e.body?.errors) || {};
    error.value = errors.value[""] ?? (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  busy.value = true;
  error.value = "";
  references.value = [];

  try {
    await withLinkedDeletion((options) => client.media.delete(props.id, options));
    emit("deleted");
  } catch (e) {
    if (e instanceof DeletionCancelled) return;

    if (e instanceof CmsError && e.status === 409) references.value = e.body.references;
    else error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(new URL(doc.value!.url, location.href).href);
    copied.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const referenceLink = (r: Reference) =>
  "global" in r
    ? `${CONTENT}/globals/${r.global}`
    : `${CONTENT}/collections/${r.collection}/${r.id}`;
</script>

<template>
  <SheetHeader class="border-border shrink-0 border-b px-6 py-5 pr-12">
    <SheetTitle class="truncate">{{ doc?.filename ?? t("nav.file") }}</SheetTitle>
  </SheetHeader>
  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    <p v-if="loading" class="text-muted-foreground text-sm" role="status">
      {{ t("common.loading") }}
    </p>
    <p v-if="error" class="text-destructive mb-4 text-sm" role="alert">{{ error }}</p>
    <template v-if="doc">
      <div
        class="bg-muted/50 border-border mb-6 flex min-h-40 items-center justify-center overflow-hidden rounded-xl border p-4"
      >
        <img
          v-if="kind === 'image'"
          :src="doc.url"
          :alt="doc.alt ?? ''"
          class="max-h-64 max-w-full rounded object-contain"
        />
        <video v-else-if="kind === 'video'" :src="doc.url" controls class="w-full rounded-lg" />
        <audio v-else-if="kind === 'audio'" :src="doc.url" controls class="w-full" />
        <div v-else class="text-muted-foreground flex flex-col items-center gap-3 py-6 text-4xl">
          <Icon :name="fileIcon(doc.mimeType)" />
          <span class="text-xs">{{ doc.mimeType }}</span>
        </div>
      </div>

      <form id="media-details" class="flex flex-col gap-5" @submit.prevent="save">
        <fieldset :disabled="busy" class="flex min-w-0 flex-col gap-4">
          <div class="flex flex-col gap-1">
            <Label for="alt">{{ t("media.alt") }}</Label>
            <Input
              id="alt"
              name="alt"
              v-model="form.alt"
              :aria-invalid="errors.alt ? true : undefined"
            />
            <span v-if="errors.alt" class="text-xs text-red-600" role="alert">{{
              errors.alt
            }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <Label for="filename">{{ t("media.filename") }}</Label>
            <Input
              id="filename"
              name="filename"
              v-model="form.filename"
              required
              :aria-invalid="errors.filename ? true : undefined"
            />
            <span v-if="errors.filename" class="text-xs text-red-600" role="alert">{{
              errors.filename
            }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <Label for="folder">{{ t("media.folder") }}</Label>
            <Input
              id="folder"
              name="folder"
              v-model="form.folder"
              list="media-folders"
              :placeholder="t('media.root')"
              :aria-invalid="errors.folder ? true : undefined"
            />
            <datalist id="media-folders">
              <option v-for="f in folders" :key="f" :value="f" />
            </datalist>
            <small class="text-muted-foreground text-xs">{{ t("media.folderHint") }}</small>
            <span v-if="errors.folder" class="text-xs text-red-600" role="alert">{{
              errors.folder
            }}</span>
          </div>
        </fieldset>

        <dl
          class="border-border grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-t pt-5 text-sm"
        >
          <dt class="text-muted-foreground">{{ t("media.type") }}</dt>
          <dd class="break-all">{{ doc.mimeType }}</dd>
          <dt class="text-muted-foreground">{{ t("media.size") }}</dt>
          <dd>{{ formatSize(doc.size, locale) }}</dd>
          <template v-if="doc.width">
            <dt class="text-muted-foreground">{{ t("media.dimensions") }}</dt>
            <dd>{{ doc.width }} × {{ doc.height }}</dd>
          </template>
          <dt class="text-muted-foreground">{{ t("media.url") }}</dt>
          <dd class="flex min-w-0 items-center gap-2">
            <a
              :href="doc.url"
              class="truncate underline"
              target="_blank"
              rel="noopener noreferrer"
              >{{ doc.url }}</a
            >
            <Button type="button" variant="ghost" size="sm" class="shrink-0" @click="copy">
              {{ t(copied ? "common.copied" : "common.copy") }}
            </Button>
          </dd>
        </dl>
        <Button as="a" :href="mediaDownload([doc.id])" download variant="outline" class="w-full"
          ><Icon name="download" />{{ t("media.download") }}</Button
        >

        <div v-if="references.length" class="text-sm text-red-600" role="alert">
          <p>{{ t("media.usedBy") }}</p>
          <ul class="list-disc pl-5">
            <li v-for="r in references" :key="referenceLink(r)">
              <RouterLink :to="referenceLink(r)" class="underline">
                {{ "global" in r ? r.global : `${r.collection} ${r.id}` }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </form>
    </template>
  </div>
  <SheetFooter
    v-if="doc"
    class="border-border shrink-0 flex-row items-center justify-between border-t px-6 py-4"
  >
    <MediaDeleteDialog
      v-if="can(schema.collections?.media, 'delete', doc)"
      :name="doc.filename"
      :disabled="busy"
      @confirm="remove"
    >
      <Button type="button" variant="ghost" class="text-destructive" :disabled="busy">
        {{ t("common.delete") }}
      </Button>
    </MediaDeleteDialog>
    <div class="flex items-center gap-3">
      <span v-if="saved" class="text-muted-foreground text-sm" role="status">{{
        t("common.saved")
      }}</span>
      <Button type="submit" form="media-details" :disabled="busy">{{ t("common.save") }}</Button>
    </div>
  </SheetFooter>
</template>
