<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Translation, useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { client, schema } from "@/shared/api";
import { Pane, PaneMenu, PaneMenuItem, PaneMenuLabel } from "@/shared";
import { titleField } from "@/modules/documents/fields";
import { type PageDocument, type PageRow, keyOf, pageRows } from "@/modules/preview/page-rows";

// The documents the page in the preview reports, in page order, each with the documents its relations point to.
// A click opens one; hovering one highlights its elements on the page.
const props = defineProps<{ documents: PageDocument[] }>();
const emit = defineEmits<{ highlight: [document: PageDocument | null] }>();
const { t } = useI18n();

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

const rows = computed(() => pageRows(props.documents, entryOf, (key) => data.value[key]));
watch(rows, (all) => all.forEach(fetchData), { immediate: true });

function item(r: PageRow) {
  const entry = entryOf(r)!;
  const type = text(entry.label) ?? r.collection;
  const doc = data.value[r.key];
  return {
    label: !r.id
      ? type
      : doc === undefined
        ? "…"
        : String(doc?.[titleField(entry)] || "") || t("common.untitled"),
    subtitle: r.id ? type : t("documents.global"),
    icon: entry.nav?.icon ?? (r.id ? "file-text" : "settings"),
    to: r.id
      ? `/presentation/collections/${r.collection}/${r.id}`
      : `/presentation/globals/${r.collection}`,
  };
}
</script>

<template>
  <Pane :title="t('preview.onPage')" :min="300" :max="Infinity" :width="480" handle="left">
    <PaneMenu layout="detailed" @mouseleave="emit('highlight', null)">
      <PaneMenuLabel>{{ t("preview.documents") }}</PaneMenuLabel>
      <div
        v-for="r in rows"
        :key="r.key"
        :style="{ paddingLeft: `${r.depth * 20}px` }"
        @mouseenter="emit('highlight', r)"
      >
        <PaneMenuItem v-bind="item(r)" />
      </div>
      <p v-if="!rows.length" class="text-muted-foreground px-2 py-2 text-sm">
        <Translation keypath="preview.empty">
          <template #code><code>edit()</code></template>
        </Translation>
      </p>
    </PaneMenu>
  </Pane>
</template>
