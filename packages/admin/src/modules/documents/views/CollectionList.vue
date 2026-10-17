<script setup lang="ts">
import PublicationStatus from "@/modules/documents/components/PublicationStatus.vue";
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { useRoute } from "vue-router";
import { client, schema } from "@/shared/api";
import { keepPaneKey, reloadKey, titleField } from "@/modules/documents/fields";
import {
  Pane,
  PaneMenu,
  PaneMenuItem,
  PaneMenuOptions,
  PaneMenuSkeleton,
  PaneSearch,
  Icon,
  useLocale,
  type PaneLayout,
  type PaneSort,
} from "@/shared";
import { Button } from "@/shared/components/ui/button";
import { ago } from "@/shared/utils";

const { t, locale: adminLocale } = useI18n();
const route = useRoute();
const name = route.params.name as string;
const collection = computed(() => schema.value.collections?.[name]);
const { locale } = useLocale();
// A localized collection lists the active language with fallback, so every row has a title.
const active = computed(() => (collection.value?.localized ? locale.value : undefined));
const docs = ref<Record<string, any>[]>([]);
const loading = ref(true);
const search = ref("");
const sorts = computed<PaneSort[]>(() => [
  { value: "title", label: t("documents.sortName") },
  { value: "updatedAt", label: t("documents.sortEdited") },
  { value: "createdAt", label: t("documents.sortCreated") },
]);
const sort = ref("updatedAt");
const layout = ref<PaneLayout>("normal");
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  const title = (d: Record<string, any>) => String(d[titleField(collection.value!)] || "");
  const key = sort.value as "title" | "updatedAt" | "createdAt";
  return docs.value
    .filter((d) => !q || title(d).toLowerCase().includes(q))
    .map((d) => ({
      id: d.id as string,
      title: title(d) || t("common.untitled"),
      updatedAt: d.updatedAt as string,
      createdAt: d.createdAt as string,
      // `locales` lists the languages with a version.
      translated: !active.value || !Array.isArray(d.locales) || d.locales.includes(active.value),
      publishedAt: d.publishedAt,
      hasDraft: d.hasDraft,
      sharedDraft: d.sharedDraft,
    }))
    .sort((a, b) =>
      key === "title" ? a.title.localeCompare(b.title) : b[key].localeCompare(a[key]),
    );
});

useHead({ title: () => text(collection.value?.label) ?? name });

// A later load wins, so a quick language switch shows the last one.
let loads = 0;
const load = () => {
  const at = ++loads;
  return client
    .find(name, {
      populate: false,
      ...(active.value && { locale: active.value, fallback: true }),
    })
    .then((d) => {
      if (at === loads) docs.value = d;
    })
    .finally(() => (loading.value = false));
};
load();
provide(reloadKey, load);
watch(active, load);

// The document pane remounts when the id changes, except once for the id a new document got.
const pane = ref(0);
let kept: string | undefined;
watch(
  () => route.params.id,
  (id) => {
    if (id === kept) kept = undefined;
    else pane.value++;
  },
);
provide(keepPaneKey, (id) => (kept = id));
</script>

<template>
  <template v-if="collection">
    <Pane :title="text(collection.label) ?? name">
      <template #actions>
        <Button as-child variant="ghost" size="icon-sm" :aria-label="t('documents.new')">
          <RouterLink :to="`${CONTENT}/collections/${name}/new`"><Icon name="plus" /></RouterLink>
        </Button>
        <PaneMenuOptions
          v-model:sort="sort"
          v-model:layout="layout"
          :sorts="sorts"
          default-sort="updatedAt"
        />
      </template>
      <PaneSearch v-model="search" />
      <PaneMenu :layout="layout">
        <PaneMenuSkeleton v-if="loading" />
        <template v-else>
          <PaneMenuItem
            class="[&_[data-slot=pane-menu-item-end]]:opacity-100"
            v-for="doc in rows"
            :key="doc.id"
            :to="`${CONTENT}/collections/${name}/${doc.id}`"
            :icon="collection.nav?.icon ?? 'file-text'"
            :label="doc.title"
            :subtitle="ago(doc.updatedAt, adminLocale)"
            :active="route.params.id === doc.id"
          >
            <template #end>
              <span class="flex items-center gap-2">
                <span v-if="!doc.translated" class="text-muted-foreground text-xs">
                  {{ t("common.notTranslated") }}
                </span>
                <PublicationStatus v-else-if="collection.drafts !== false" :doc="doc" compact />
              </span>
            </template>
          </PaneMenuItem>
          <p v-if="!loading && !rows.length" class="text-muted-foreground px-2 py-2 text-sm">
            {{ t(search ? "common.noMatches" : "common.nothingYet") }}
          </p>
        </template>
      </PaneMenu>
    </Pane>
    <RouterView v-slot="{ Component }">
      <component :is="Component" v-if="Component" :key="pane" />
      <div
        v-else
        class="text-muted-foreground hidden flex-1 items-center justify-center text-sm sm:flex"
      >
        {{ t("documents.selectDocument") }}
      </div>
    </RouterView>
  </template>
</template>
