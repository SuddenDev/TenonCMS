<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { client, schema, type Fields } from "@/shared/api";
import { Pane, PaneMenu, PaneMenuItem, PaneMenuLabel } from "@/shared";
import { titleField } from "@/modules/documents/fields";

/** A document or global the page renders. `id` is `''` for a global. */
export type PageDocument = { collection: string; id: string };

// The documents the page in the preview reports, in page order, each with the documents its relations point to.
// A click opens one; hovering one highlights its elements on the page.
const props = defineProps<{ documents: PageDocument[] }>();
const emit = defineEmits<{ highlight: [document: PageDocument | null] }>();

const keyOf = (d: PageDocument) => `${d.collection}:${d.id}`;
const entryOf = (d: PageDocument) =>
  d.id ? schema.value.collections?.[d.collection] : schema.value.globals?.[d.collection];

// Stored data by key, without populate, so relations hold ids.
const data = ref<Record<string, Record<string, any> | null>>({});
const requested = new Set<string>();
function fetchData(d: PageDocument) {
  const key = keyOf(d);
  if (requested.has(key) || !entryOf(d)) return;
  requested.add(key);
  (d.id ? client.findById(d.collection, d.id, { populate: false }) : client.getGlobal(d.collection))
    .then((doc) => (data.value[key] = (doc as Record<string, any>) ?? null))
    .catch(() => requested.delete(key));
}

// Relation ids at the top level and in groups. The media library has no presentation route.
function refsOf(fields: Fields, value: Record<string, any> | null | undefined): PageDocument[] {
  return Object.entries(fields).flatMap(([k, f]): PageDocument[] => {
    const v = value?.[k];
    if (f.type === "group") return refsOf(f.fields, v);
    if (f.type !== "relation" || f.collection === "media") return [];
    return [v]
      .flat()
      .filter((id) => typeof id === "string")
      .map((id) => ({ collection: f.collection, id }));
  });
}

type Row = PageDocument & { key: string; depth: number };
// Each document shows once, where it first appears: the page's own, then the ones they point to, depth first.
const rows = computed(() => {
  const seen = new Set<string>();
  const out: Row[] = [];
  const visit = (d: PageDocument, depth: number) => {
    const key = keyOf(d);
    const entry = entryOf(d);
    if (seen.has(key) || !entry) return;
    seen.add(key);
    out.push({ ...d, key, depth });
    for (const r of refsOf(entry.fields, data.value[key])) visit(r, depth + 1);
  };
  for (const d of props.documents) visit(d, 0);
  return out;
});
watch(rows, (all) => all.forEach(fetchData), { immediate: true });

function item(r: Row) {
  const entry = entryOf(r)!;
  const type = entry.label ?? r.collection;
  const doc = data.value[r.key];
  return {
    label: !r.id
      ? type
      : doc === undefined
        ? "…"
        : String(doc?.[titleField(entry)] || "") || "(untitled)",
    subtitle: r.id ? type : "Global",
    icon: entry.nav?.icon ?? (r.id ? "file-text" : "settings"),
    to: r.id
      ? `/presentation/collections/${r.collection}/${r.id}`
      : `/presentation/globals/${r.collection}`,
  };
}
</script>

<template>
  <Pane title="On this page" :min="300" :max="Infinity" :width="480" handle="left">
    <PaneMenu layout="detailed" @mouseleave="emit('highlight', null)">
      <PaneMenuLabel>Documents on this page</PaneMenuLabel>
      <div
        v-for="r in rows"
        :key="r.key"
        :style="{ paddingLeft: `${r.depth * 20}px` }"
        @mouseenter="emit('highlight', r)"
      >
        <PaneMenuItem v-bind="item(r)" />
      </div>
      <p v-if="!rows.length" class="text-muted-foreground px-2 py-2 text-sm">
        This page shows no editable content. Elements bound with <code>edit()</code> appear here.
      </p>
    </PaneMenu>
  </Pane>
</template>
