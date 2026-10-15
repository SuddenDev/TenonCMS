<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
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

const { t, locale } = useI18n();
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

useHead({ title: () => doc.value?.filename ?? t("nav.media") });
useBreadcrumb(() => doc.value?.filename);

function show(d: MediaRead) {
  doc.value = d;
  form.value = { alt: d.alt ?? "", filename: d.filename, folder: d.folder };
}
client.findById("media", id).then(
  (d) => show(d as MediaRead),
  () => (error.value = t("media.notFound")),
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
    await router.push(
      doc.value?.folder ? `${CONTENT}/media/${doc.value.folder}` : `${CONTENT}/media`,
    );
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
  "global" in r
    ? `${CONTENT}/globals/${r.global}`
    : `${CONTENT}/collections/${r.collection}/${r.id}`;
</script>

<template>
  <RouterLink
    :to="doc?.folder ? `${CONTENT}/media/${doc.folder}` : `${CONTENT}/media`"
    class="text-muted-foreground text-sm"
  >
    ← {{ t("nav.media") }}
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
        <a v-else :href="doc.url" download class="btn inline-block">{{ t("media.download") }}</a>
      </div>

      <form class="flex w-full max-w-sm flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-1">
          <Label for="alt">{{ t("media.alt") }}</Label>
          <Input id="alt" v-model="form.alt" :aria-invalid="errors.alt ? true : undefined" />
          <span v-if="errors.alt" class="text-xs text-red-600" role="alert">{{ errors.alt }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <Label for="filename">{{ t("media.filename") }}</Label>
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
          <Label for="folder">{{ t("media.folder") }}</Label>
          <Input
            id="folder"
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

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted-foreground">{{ t("media.type") }}</dt>
          <dd>{{ doc.mimeType }}</dd>
          <dt class="text-muted-foreground">{{ t("media.size") }}</dt>
          <dd>{{ formatSize(doc.size, locale) }}</dd>
          <template v-if="doc.width">
            <dt class="text-muted-foreground">{{ t("media.dimensions") }}</dt>
            <dd>{{ doc.width }} × {{ doc.height }}</dd>
          </template>
          <dt class="text-muted-foreground">{{ t("media.url") }}</dt>
          <dd class="flex min-w-0 items-center gap-2">
            <a :href="doc.url" class="truncate underline" target="_blank">{{ doc.url }}</a>
            <button type="button" class="btn-ghost shrink-0" @click="copy">
              {{ t(copied ? "common.copied" : "common.copy") }}
            </button>
          </dd>
        </dl>

        <div class="flex items-center gap-3">
          <button class="btn" :disabled="busy">{{ t("common.save") }}</button>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <button type="button" class="btn-ghost text-red-600">
                {{ t("common.delete") }}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{{
                  t("media.deleteTitle", { name: doc.filename })
                }}</AlertDialogTitle>
                <AlertDialogDescription>{{ t("media.deleteText") }}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" @click="remove">{{
                  t("common.delete")
                }}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span v-if="saved" class="text-sm text-green-700" role="status">{{
            t("common.saved")
          }}</span>
          <span v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</span>
        </div>

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
    </div>
  </div>
</template>
