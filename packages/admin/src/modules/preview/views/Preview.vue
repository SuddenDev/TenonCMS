<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useDebounceFn } from "@vueuse/core";
import { computed, provide, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client, schema, type Fields } from "@/shared/api";
import { focusKey } from "@/modules/documents/fields";
import { useRefs } from "@/modules/documents/composables/useRefs";
import DocPane from "@/modules/documents/components/DocPane.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import { Icon, useLocale } from "@/shared";
import { Button } from "@/shared/components/ui/button";
import { resolveDraft } from "@/modules/preview/draft-documents";
import PageDocuments from "@/modules/preview/components/PageDocuments.vue";
import PreviewPane from "@/modules/preview/components/PreviewPane.vue";
import type { PageDocument } from "@/modules/preview/page-rows";
import {
  excluded,
  type PageMessage,
  siteUrl,
  usePreviewChannel,
} from "@/modules/preview/composables/usePreviewChannel";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
// No name: the site itself, without a document.
const name = computed(() => (route.params.name as string | undefined) ?? "");
const isGlobal = computed(() => route.path.startsWith("/presentation/globals/"));
// An empty id is a global, as in the preview protocol.
const id = computed(() => (route.params.id as string | undefined) ?? "");
const key = computed(() => `${name.value}:${id.value}`);
const entry = computed(() =>
  id.value ? schema.value.collections?.[name.value] : schema.value.globals?.[name.value],
);
const fields = computed<Fields>(() => entry.value?.fields ?? {});
const { locale } = useLocale();
// The language of a localized collection or global, for URLs and messages.
const localeOf = (collection: string, global = false) =>
  (global ? schema.value.globals?.[collection] : schema.value.collections?.[collection])?.localized
    ? locale.value
    : undefined;
const active = computed(() => localeOf(name.value, !id.value));
// The document and language the form edits. A request started for another one is dropped.
const scope = computed(() => `${key.value}:${active.value ?? ""}`);
const saved = (collection: string, id: string, global = false) => {
  documents = new Map();
  const l = localeOf(collection, global);
  send({ type: "saved", collection, id, ...(l && { locale: l }) });
};
const { refs, openAt, closeAt } = useRefs();

const focus = ref<string | null>(null);
provide(focusKey, focus);

// Only http(s) URLs reach the iframe and `window.open`. Relative ones resolve against the site.
function safe(value: string | null) {
  try {
    const u = new URL(value ?? "", siteUrl());
    return value !== null && /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

const edit = ref(true);
const href = ref("");
const url = ref<string | null>();
const draft = shallowRef<Record<string, unknown>>();
const frame = ref(0);
// What the page in the preview reports it shows.
const onPage = ref<PageDocument[]>([]);

// Switches documents first, so a field with the same path in the old form does not take the focus.
const send = usePreviewChannel(async (message: PageMessage) => {
  // A page that just loaded knows neither the mode nor the unsaved state.
  if (message.type === "mode") {
    edit.value = message.edit;
    return;
  }
  if (message.type === "ready") {
    onPage.value = [];
    sendMode();
    broadcast();
    return;
  }
  if (message.type === "url") {
    href.value = safe(message.href) ?? "";
    return;
  }
  if (message.type === "documents") {
    onPage.value = message.documents;
    return;
  }
  // Other admin tabs share the channel; only a page's edit click is handled here.
  if (message.type !== "edit") return;
  const to = message.id
    ? `/presentation/collections/${message.collection}/${message.id}`
    : `/presentation/globals/${message.collection}`;
  if (message.collection !== name.value || message.id !== id.value) await router.push(to);
  focus.value = message.path;
});
// The page learns which entries edit mode leaves alone with every `mode` message.
const sendMode = () => send({ type: "mode", edit: edit.value, exclude: excluded() });
watch(edit, sendMode);

function previewUrl(data: Record<string, unknown>): Promise<string | null> {
  const options = { locale: active.value || undefined };
  return id.value
    ? client.previewUrl(name.value, data, options)
    : client.previewGlobalUrl(name.value, data, options);
}

// A failed request shows the same "no preview" state as a `null` URL.
async function load() {
  const at = scope.value;
  const data = draft.value ?? {};
  url.value = undefined;
  href.value = "";
  const next = await previewUrl(data).catch(() => null);
  if (at === scope.value) url.value = safe(next);
}
// A new document loads its URL with its first form state. Typing never changes the `src`.
// Back on the list, the page stays where it is.
watch(key, () => {
  draft.value = undefined;
  send({ type: "highlight", collection: null, id: null });
});
// The form of the new language loads its own URL with its first state.
watch(active, () => (draft.value = undefined));

// The `?url=` page shows first, else the site root. Only a page of the site MAY load, so a link cannot frame another one.
const start = typeof route.query.url === "string" ? safe(route.query.url) : null;
navigate(start && new URL(start).origin === new URL(siteUrl()).origin ? start : "");

// A typed URL. The iframe reloads even when `src` did not change, because the page may have moved on.
function navigate(value: string) {
  url.value = safe(value);
  href.value = "";
  frame.value++;
}

// Image, file and relation fields go out as their documents, read like a page reads them, in the target's language.
// Saves clear the cache, because a document MAY have changed.
let documents = new Map<string, Promise<unknown>>();
const loadDocument = (collection: string, id: string) => {
  const l = localeOf(collection);
  const key = `${collection}:${id}:${l ?? ""}`;
  if (!documents.has(key)) documents.set(key, client.findById(collection, id, { locale: l }));
  return documents.get(key)!;
};

let sent = 0;
const broadcast = useDebounceFn(async () => {
  if (!name.value || !draft.value) return;
  const n = ++sent;
  const at = scope.value;
  const data = await resolveDraft(fields.value, draft.value, loadDocument);
  if (n !== sent || at !== scope.value) return;
  // The form state holds Vue proxies, which `postMessage` cannot clone.
  send({
    type: "draft",
    collection: name.value,
    id: id.value,
    data: JSON.parse(JSON.stringify(data)),
    ...(active.value && { locale: active.value }),
  });
}, 50);

// A document without `preview`, like an author, is edited on the page that shows now.
function change(data: Record<string, unknown>) {
  const first = !draft.value;
  draft.value = data;
  if (first && entry.value?.preview) load();
  broadcast();
}

function close() {
  router.push(
    !name.value
      ? "/"
      : !isGlobal.value
        ? `${CONTENT}/collections/${name.value}/${id.value}`
        : schema.value.globals?.[name.value]?.nav?.display === "settings"
          ? `${CONTENT}/settings/globals/${name.value}`
          : `${CONTENT}/globals/${name.value}`,
  );
}
</script>

<template>
  <PreviewPane
    v-model:edit="edit"
    :url="url"
    :href="href"
    :target="key"
    :frame="frame"
    @reload="entry?.preview ? load() : navigate(href || url || '')"
    @navigate="navigate"
    @close="close"
  />
  <template v-if="name && id">
    <DocPane
      :key="key"
      :name="name"
      :id="id"
      :open="openAt(-1)"
      previewing
      :min="300"
      :max="Infinity"
      :width="480"
      handle="left"
      :grow="false"
      @change="change"
      @saved="saved(name, id)"
      @deleted="router.push('/presentation')"
    >
      <template #actions>
        <Button as-child variant="ghost" size="icon-sm" :aria-label="t('preview.documents')">
          <RouterLink to="/presentation"><Icon name="list" /></RouterLink>
        </Button>
      </template>
    </DocPane>
    <DocPane
      v-for="(r, i) in refs"
      :key="`${i}:${r.key}`"
      :name="r.collection"
      :id="r.id"
      :open="openAt(i)"
      closable
      previewing
      @saved="saved(r.collection, r.id)"
      @close="closeAt(i)"
      @deleted="closeAt(i)"
    />
  </template>
  <GlobalEdit
    v-else-if="isGlobal"
    :key="key"
    previewing
    :min="300"
    :max="Infinity"
    :width="480"
    handle="left"
    :grow="false"
    @change="change"
    @saved="saved(name, '', true)"
  >
    <template #actions>
      <Button as-child variant="ghost" size="icon-sm" :aria-label="t('preview.documents')">
        <RouterLink to="/presentation"><Icon name="list" /></RouterLink>
      </Button>
    </template>
  </GlobalEdit>
  <PageDocuments
    v-else
    :documents="onPage"
    @highlight="
      (d) => send({ type: 'highlight', collection: d?.collection ?? null, id: d?.id ?? null })
    "
  />
</template>
