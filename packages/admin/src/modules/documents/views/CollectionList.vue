<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, provide, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema } from "@/shared/api";
import { reloadKey, titleField } from "@/modules/documents/fields";
import {
  Pane,
  PaneMenu,
  PaneMenuItem,
  PaneMenuOptions,
  PaneMenuSkeleton,
  PaneSearch,
  Icon,
  type PaneLayout,
  type PaneSort,
} from "@/shared";
import { Button } from "@/shared/components/ui/button";
import { ago } from "@/shared/utils";

const route = useRoute();
const name = route.params.name as string;
const collection = computed(() => schema.value.collections?.[name]);
const docs = ref<Record<string, any>[]>([]);
const loading = ref(true);
const search = ref("");
const sorts: PaneSort[] = [
  { value: "title", label: "Sort by Name" },
  { value: "updatedAt", label: "Sort by Last Edited" },
  { value: "createdAt", label: "Sort by Created" },
];
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
      title: title(d) || "(untitled)",
      updatedAt: d.updatedAt as string,
      createdAt: d.createdAt as string,
    }))
    .sort((a, b) =>
      key === "title" ? a.title.localeCompare(b.title) : b[key].localeCompare(a[key]),
    );
});

useHead({ title: () => collection.value?.label ?? name });

const load = () =>
  client
    .find(name, { populate: false })
    .then((d) => (docs.value = d))
    .finally(() => (loading.value = false));
load();
provide(reloadKey, load);
</script>

<template>
  <template v-if="collection">
    <Pane :title="collection.label ?? name">
      <template #actions>
        <Button as-child variant="ghost" size="icon-sm" aria-label="New">
          <RouterLink :to="`/collections/${name}/new`"><Icon name="plus" /></RouterLink>
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
            v-for="doc in rows"
            :key="doc.id"
            :to="`/collections/${name}/${doc.id}`"
            :icon="collection.nav?.icon ?? 'file-text'"
            :label="doc.title"
            :subtitle="ago(doc.updatedAt)"
            :active="route.params.id === doc.id"
          />
          <p v-if="!loading && !rows.length" class="text-muted-foreground px-2 py-2 text-sm">
            {{ search ? "No matches." : "Nothing here yet." }}
          </p>
        </template>
      </PaneMenu>
    </Pane>
    <RouterView v-slot="{ Component }">
      <component :is="Component" v-if="Component" :key="String(route.params.id)" />
      <div
        v-else
        class="text-muted-foreground hidden flex-1 items-center justify-center text-sm sm:flex"
      >
        Select a document
      </div>
    </RouterView>
  </template>
</template>
