<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useDebounceFn } from "@vueuse/core";
import { computed, provide, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { client, schema, type Fields } from "@/shared/api";
import { focusKey } from "@/modules/documents/fields";
import { useRefs } from "@/modules/documents/composables/useRefs";
import DocPane from "@/modules/documents/components/DocPane.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import { Icon } from "@/shared";
import { Button } from "@/shared/components/ui/button";
import PageDocuments, { type PageDocument } from "@/modules/preview/components/PageDocuments.vue";
import PreviewPane from "@/modules/preview/components/PreviewPane.vue";
import {
  type PageMessage,
  siteUrl,
  usePreviewChannel,
} from "@/modules/preview/composables/usePreviewChannel";

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
    send({ type: "mode", edit: edit.value });
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
watch(edit, (value) => send({ type: "mode", edit: value }));

// A failed request shows the same "no preview" state as a `null` URL.
async function load() {
  const at = key.value;
  const data = draft.value ?? {};
  url.value = undefined;
  href.value = "";
  const next = await (
    id.value ? client.previewUrl(name.value, data) : client.previewGlobalUrl(name.value, data)
  ).catch(() => null);
  if (at === key.value) url.value = safe(next);
}
// A new document loads its URL with its first form state. Typing never changes the `src`.
// Back on the list, the page stays where it is.
watch(key, () => {
  draft.value = undefined;
  send({ type: "highlight", collection: null, id: null });
});

// The `?url=` page shows first, else the site root. Only a page of the site MAY load, so a link cannot frame another one.
const start = typeof route.query.url === "string" ? safe(route.query.url) : null;
navigate(start && new URL(start).origin === new URL(siteUrl()).origin ? start : "");

// A typed URL. The iframe reloads even when `src` did not change, because the page may have moved on.
function navigate(value: string) {
  url.value = safe(value);
  href.value = "";
  frame.value++;
}

// Image and file fields go out as their media documents, `many` ones as arrays.
const media = new Map<string, Promise<unknown>>();
const mediaDoc = (mediaId: string) => {
  if (!media.has(mediaId))
    media.set(
      mediaId,
      client.findById("media", mediaId).catch(() => null),
    );
  return media.get(mediaId)!;
};
async function withMedia(fields: Fields, data: Record<string, any>) {
  const out: Record<string, unknown> = { ...data };
  for (const [k, f] of Object.entries(fields)) {
    const v = data[k];
    if (!v) continue;
    if (f.type === "group") out[k] = await withMedia(f.fields, v);
    else if (f.type === "image" || f.type === "file")
      out[k] = await (Array.isArray(v) ? Promise.all(v.map(mediaDoc)) : mediaDoc(v));
  }
  return out;
}

let sent = 0;
const broadcast = useDebounceFn(async () => {
  if (!name.value || !draft.value) return;
  const n = ++sent;
  const at = { collection: name.value, id: id.value };
  const data = await withMedia(fields.value, draft.value);
  if (n !== sent) return;
  // The form state holds Vue proxies, which `postMessage` cannot clone.
  send({ type: "draft", ...at, data: JSON.parse(JSON.stringify(data)) });
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
      @saved="send({ type: 'saved', collection: name, id })"
      @deleted="router.push('/presentation')"
    >
      <template #actions>
        <Button as-child variant="ghost" size="icon-sm" aria-label="Documents on this page">
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
      @saved="send({ type: 'saved', collection: r.collection, id: r.id })"
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
    @saved="send({ type: 'saved', collection: name, id: '' })"
  >
    <template #actions>
      <Button as-child variant="ghost" size="icon-sm" aria-label="Documents on this page">
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
