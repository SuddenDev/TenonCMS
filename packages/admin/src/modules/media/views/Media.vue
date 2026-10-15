<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client, schema } from "@/shared/api";
import MediaLibrary from "@/modules/media/components/MediaLibrary.vue";
import { Progress } from "@/shared/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

const route = useRoute();
const router = useRouter();
const folder = computed({
  get: () => String(route.params.folder ?? ""),
  set: (f: string) => void router.push(f ? `${CONTENT}/media/${f}` : `${CONTENT}/media`),
});
const library = ref<InstanceType<typeof MediaLibrary>>();
const failed = ref<{ id: string; message: string }[]>([]);
const error = ref("");

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

async function rename() {
  const to = prompt(t("media.moveFolder"), folder.value)?.trim();
  if (!to || to === folder.value) return;
  error.value = "";
  try {
    const result = await client.media.renameFolder(folder.value, to);
    failed.value = result.failed;
    if (!result.failed.length) folder.value = to.replace(/^\/+|\/+$/g, "");
    else await library.value?.load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <h1 class="mb-6 text-2xl font-semibold">{{ t("nav.media") }}</h1>
  <div v-if="error || failed.length" class="mb-4 text-sm text-red-600" role="alert">
    <p v-if="error">{{ error }}</p>
    <template v-else>
      <p>{{ t("media.notMoved") }}</p>
      <ul class="list-disc pl-5">
        <li v-for="f in failed" :key="f.id">
          <RouterLink :to="`${CONTENT}/media-file/${f.id}`" class="underline">{{ f.id }}</RouterLink
          >:
          {{ f.message }}
        </li>
      </ul>
    </template>
  </div>
  <div v-if="job" class="mb-4 text-sm" role="status">
    <Progress :model-value="job.total ? (job.done / job.total) * 100 : 100" class="mb-1 h-1.5" />
    <p v-if="job.done < job.total">
      {{ t("media.regenerating", { done: job.done, total: job.total }) }}
    </p>
    <p v-else>
      {{ t("media.regenerated", { rendered: job.rendered, removed: job.removed }) }}
      <button type="button" class="underline" @click="job = null">
        {{ t("common.dismiss") }}
      </button>
    </p>
  </div>
  <MediaLibrary
    ref="library"
    v-model:folder="folder"
    @open="(id) => router.push(`${CONTENT}/media-file/${id}`)"
  >
    <template #actions>
      <DropdownMenu v-if="schema.media?.regenerate">
        <DropdownMenuTrigger as-child>
          <button type="button" class="btn-ghost" :disabled="!!job && job.done < job.total">
            {{ t("media.library") }}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @select="regenerate(false)">{{
            t("media.regenerate")
          }}</DropdownMenuItem>
          <DropdownMenuItem @select="regenerate(true)">{{ t("media.rerender") }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu v-if="folder">
        <DropdownMenuTrigger as-child>
          <button type="button" class="btn-ghost">{{ t("media.folder") }}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @select="rename">{{ t("media.rename") }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>
  </MediaLibrary>
</template>
