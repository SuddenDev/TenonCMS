<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client, CmsError, schema } from "@/shared/api";
import MediaLibrary from "@/modules/media/components/MediaLibrary.vue";
import MediaRenameDialog from "../components/dialogs/MediaRenameDialog.vue";
import MediaFile from "./MediaFile.vue";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Progress } from "@/shared/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";
import { storeThumbnail } from "@/modules/media/thumbnail";

const route = useRoute();
const router = useRouter();
const folder = computed({
  get: () => String(route.params.folder ?? ""),
  set: (f: string) => void router.push(f ? `${CONTENT}/media/${f}` : `${CONTENT}/media`),
});
const library = ref<InstanceType<typeof MediaLibrary>>();
const file = computed(() => (typeof route.query.file === "string" ? route.query.file : ""));
const detailOpen = computed({
  get: () => !!file.value,
  set: (open: boolean) => {
    if (!open) {
      const query = { ...route.query };
      delete query.file;
      void router.push({ path: route.path, query });
    }
  },
});
const error = ref("");
const renameOpen = ref(false);
const renameBusy = ref(false);
const renameError = ref("");

const { t } = useI18n();
useHead({ title: () => t("nav.media") });

// Without an image provider, only the browser can make previews. Regenerate tells per image whether one is missing; one
// request per image, so no request runs long. Providers regenerate with `tenon media regenerate` instead.
const job = ref<{ done: number; total: number; created: number } | null>(null);
async function createPreviews() {
  error.value = "";
  const images = (await client.find("media", { populate: false })).filter((d) =>
    String(d.mimeType).startsWith("image/"),
  );
  job.value = { done: 0, total: images.length, created: 0 };
  try {
    for (const d of images) {
      const { needsThumbnail } = await client.media.regenerate(d.id);
      if (needsThumbnail && (await remakeThumbnail(d.id, d.url))) job.value.created++;
      job.value.done++;
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}

// A file the browser cannot load, e.g. from a bucket without CORS, keeps showing the original.
async function remakeThumbnail(id: string, url: string) {
  const res = await fetch(url).catch(() => undefined);
  return res?.ok ? storeThumbnail(id, await res.blob()) : false;
}

function startRename() {
  renameError.value = "";
  renameOpen.value = true;
}

async function rename(to: string) {
  if (renameBusy.value) return;
  renameError.value = "";
  renameBusy.value = true;
  try {
    const result = await library.value!.renameFolder(to);
    if (result.failed.length)
      renameError.value = `${t("media.notMoved")} ${result.failed.map((file) => `${file.id}: ${file.message}`).join("; ")}`;
    else renameOpen.value = false;
  } catch (e) {
    renameError.value =
      (e instanceof CmsError && e.body?.errors && Object.values(e.body.errors).join("; ")) ||
      (e as Error).message;
  } finally {
    renameBusy.value = false;
  }
}
</script>

<template>
  <MediaLibrary
    ref="library"
    class="h-full"
    v-model:folder="folder"
    @open="(id) => router.push({ path: route.path, query: { ...route.query, file: id } })"
  >
    <template #actions>
      <DropdownMenu v-if="folder || schema.media?.thumbnails">
        <DropdownMenuTrigger as-child>
          <Button type="button" size="icon" variant="ghost" :aria-label="t('common.advanced')">
            <Icon name="ellipsis" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-48">
          <DropdownMenuItem v-if="folder" @select="startRename">{{
            t("media.renameFolder")
          }}</DropdownMenuItem>
          <DropdownMenuSeparator v-if="folder && schema.media?.thumbnails" />
          <DropdownMenuItem v-if="schema.media?.thumbnails" @select="createPreviews">{{
            t("media.createPreviews")
          }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>
    <template #status>
      <p v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</p>
      <div v-if="job" class="text-sm" role="status">
        <Progress
          :model-value="job.total ? (job.done / job.total) * 100 : 100"
          class="mb-1 h-1.5"
        />
        <p v-if="job.done < job.total">
          {{ t("media.creatingPreviews", { done: job.done, total: job.total }) }}
        </p>
        <p v-else>
          {{ t("media.previewsCreated", { count: job.created }) }}
          <Button type="button" variant="link" size="xs" @click="job = null">{{
            t("common.dismiss")
          }}</Button>
        </p>
      </div>
    </template>
  </MediaLibrary>
  <MediaRenameDialog
    v-model:open="renameOpen"
    :name="folder"
    :label="t('media.folder')"
    :error="renameError"
    :busy="renameBusy"
    @submit="rename"
  />
  <Sheet v-model:open="detailOpen">
    <SheetContent
      class="gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      :aria-describedby="undefined"
    >
      <MediaFile
        v-if="file"
        :key="file"
        :id="file"
        @saved="library?.load()"
        @deleted="
          detailOpen = false;
          library?.load();
        "
      />
    </SheetContent>
  </Sheet>
</template>
