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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";

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

// One request per image, so no request runs long. Variants of deleted files are cleaned by `cms.media.regenerate()` only.
const job = ref<{ done: number; total: number; rendered: number; removed: number } | null>(null);
async function regenerate(force: boolean) {
  error.value = "";
  const images = (await client.find("media", { populate: false })).filter((d) =>
    String(d.mimeType).startsWith("image/"),
  );
  job.value = { done: 0, total: images.length, rendered: 0, removed: 0 };
  try {
    for (const d of images) {
      const result = await client.media.regenerate(d.id, { force });
      job.value.rendered += result.rendered;
      job.value.removed += result.removed;
      job.value.done++;
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
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
      <DropdownMenu v-if="schema.media?.regenerate">
        <DropdownMenuTrigger as-child>
          <Button type="button" size="icon" variant="ghost" :aria-label="t('common.advanced')">
            <Icon name="ellipsis" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-48">
          <template v-if="folder">
            <DropdownMenuItem @select="startRename">{{ t("media.renameFolder") }}</DropdownMenuItem>
            <DropdownMenuSeparator />
          </template>
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{{ t("common.advanced") }}</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent class="min-w-48">
                  <DropdownMenuItem @select="regenerate(false)">{{
                    t("media.regenerate")
                  }}</DropdownMenuItem>
                  <DropdownMenuItem @select="regenerate(true)">{{
                    t("media.rerender")
                  }}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
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
          {{ t("media.regenerating", { done: job.done, total: job.total }) }}
        </p>
        <p v-else>
          {{ t("media.regenerated", { rendered: job.rendered, removed: job.removed }) }}
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
