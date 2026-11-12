<script setup lang="ts">
import PublicationStatus from "@/modules/documents/components/PublicationStatus.vue";
import { listScheduledByDoc } from "@/modules/jobs/jobs";
import type { Job } from "../../../../../core/src/jobs/types";
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { client, schema } from "@/shared/api";
import { can } from "@/shared/access";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ago } from "@/shared/utils";

const { t, locale: adminLocale } = useI18n();
const route = useRoute();
const router = useRouter();
const name = route.params.name as string;
const collection = computed(() => schema.value.collections?.[name]);
const { locale } = useLocale();
// A localized collection lists the active language with fallback, so every row has a title.
const active = computed(() => (collection.value?.localized ? locale.value : undefined));
const docs = ref<Record<string, any>[]>([]);
// The queued publishes and unpublishes by document id. One request for the whole list.
const scheduled = ref(new Map<string, Job[]>());
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
      scheduled: scheduled.value.get(d.id),
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
  if (collection.value?.schedule && can(collection.value, "update"))
    listScheduledByDoc(name)
      .then((byDoc) => {
        if (at === loads) scheduled.value = byDoc;
      })
      .catch(() => {});
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

async function duplicate(id: string) {
  try {
    const created = await client.duplicate(name, id);
    load();
    await router.push(`${CONTENT}/collections/${name}/${created.id}`);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
</script>

<template>
  <template v-if="collection">
    <Pane :title="text(collection.label) ?? name">
      <template #actions>
        <Button
          v-if="can(collection, 'create')"
          as-child
          variant="ghost"
          size="icon-sm"
          :aria-label="t('documents.new')"
        >
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
          <!-- The row is no link: a link MUST NOT hold the menu button. The title's link covers the row. -->
          <PaneMenuItem
            v-for="doc in rows"
            :key="doc.id"
            as="div"
            class="relative [&_[data-slot=pane-menu-item-end]]:opacity-100"
            :icon="collection.nav?.icon ?? 'file-text'"
            :subtitle="ago(doc.updatedAt, adminLocale)"
            :active="route.params.id === doc.id"
          >
            <RouterLink
              :to="`${CONTENT}/collections/${name}/${doc.id}`"
              class="focus-visible:after:ring-ring/50 after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2"
            >
              {{ doc.title }}
            </RouterLink>
            <template #end>
              <span class="relative flex items-center gap-2">
                <DropdownMenu v-if="can(collection, 'create')">
                  <DropdownMenuTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      :aria-label="t('documents.actions')"
                      class="transition-opacity data-[state=open]:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within/pane-menu-item:opacity-100 pointer-fine:group-hover/pane-menu-item:opacity-100"
                    >
                      <Icon name="ellipsis" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="duplicate(doc.id)">
                      <Icon name="copy" />{{ t("documents.duplicate") }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span v-if="!doc.translated" class="text-muted-foreground text-xs">
                  {{ t("common.notTranslated") }}
                </span>
                <template v-else-if="collection.drafts !== false">
                  <PublicationStatus :doc="doc" :scheduled="doc.scheduled" compact />
                </template>
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
