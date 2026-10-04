<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { computed, provide, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { client, schema, type Fields } from "@/shared/api";
import { focusKey } from "@/modules/documents/fields";
import { useRefs } from "@/modules/documents/composables/useRefs";
import DocPane from "@/modules/documents/components/DocPane.vue";
import GlobalEdit from "@/modules/documents/views/GlobalEdit.vue";
import PreviewPane from "@/modules/preview/components/PreviewPane.vue";
import {
  type PageMessage,
  usePreviewChannel,
} from "@/modules/preview/composables/usePreviewChannel";

const route = useRoute();
const router = useRouter();
const name = computed(() => route.params.name as string);
// An empty id is a global, as in the preview protocol.
const id = computed(() => (route.params.id as string | undefined) ?? "");
const key = computed(() => `${name.value}:${id.value}`);
const fields = computed<Fields>(
  () =>
    (id.value ? schema.value.collections?.[name.value] : schema.value.globals?.[name.value])
      ?.fields ?? {},
);
const { refs, openAt, closeAt } = useRefs();

const focus = ref<string | null>(null);
provide(focusKey, focus);

// Only http(s) URLs reach the iframe and `window.open`.
function safe(value: string | null) {
  try {
    const u = new URL(value ?? "", location.origin);
    return value !== null && /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

const edit = ref(true);
const href = ref("");
const url = ref<string | null>();
const draft = shallowRef<Record<string, unknown>>();

// Switches documents first, so a field with the same path in the old form does not take the focus.
const send = usePreviewChannel(async (message: PageMessage) => {
  // A page that just loaded knows neither the mode nor the unsaved state.
  if (message.type === "url") {
    href.value = safe(message.href) ?? "";
    send({ type: "mode", edit: edit.value });
    broadcast();
    return;
  }
  const to = message.id
    ? `/preview/collections/${message.collection}/${message.id}`
    : `/preview/globals/${message.collection}`;
  if (message.collection !== name.value || message.id !== id.value) await router.push(to);
  focus.value = message.path;
});
watch(edit, (value) => send({ type: "mode", edit: value }));

// A failed request shows the same "no preview" state as a `null` URL.
async function load() {
  const at = key.value;
  const data = draft.value ?? {};
  url.value = undefined;
  const next = await (
    id.value ? client.previewUrl(name.value, data) : client.previewGlobalUrl(name.value, data)
  ).catch(() => null);
  if (at === key.value) url.value = safe(next);
}
// A new document loads its URL with its first form state. Typing never changes the `src`.
watch(key, () => {
  draft.value = undefined;
  href.value = "";
});

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
  const n = ++sent;
  const at = { collection: name.value, id: id.value };
  const data = await withMedia(fields.value, draft.value ?? {});
  if (n !== sent) return;
  // The form state holds Vue proxies, which a BroadcastChannel cannot clone.
  send({ type: "draft", ...at, data: JSON.parse(JSON.stringify(data)) });
}, 50);

function change(data: Record<string, unknown>) {
  const first = !draft.value;
  draft.value = data;
  if (first) load();
  broadcast();
}

function close() {
  router.push(
    id.value ? `/collections/${name.value}/${id.value}` : `/settings/globals/${name.value}`,
  );
}
</script>

<template>
  <PreviewPane
    v-model:edit="edit"
    :url="url"
    :href="href"
    :target="key"
    @reload="load"
    @close="close"
  />
  <template v-if="id">
    <DocPane
      :key="key"
      :name="name"
      :id="id"
      :open="openAt(-1)"
      previewing
      :min="480"
      :max="800"
      :grow="false"
      @change="change"
      @saved="send({ type: 'saved', collection: name, id })"
      @deleted="router.push(`/collections/${name}`)"
    />
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
    v-else
    :key="key"
    previewing
    :min="480"
    :max="800"
    :grow="false"
    @change="change"
    @saved="send({ type: 'saved', collection: name, id: '' })"
  />
</template>
