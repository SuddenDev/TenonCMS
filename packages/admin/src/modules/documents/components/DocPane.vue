<script setup lang="ts">
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, inject, provide, ref } from "vue";
import { useRouter } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import { keepPaneKey, openRefKey, reloadKey, titleField } from "@/modules/documents/fields";
import DocForm from "@/modules/documents/components/DocForm.vue";
import StatusBadges from "@/modules/documents/components/StatusBadges.vue";
import { Pane, Icon, usePerspective } from "@/shared";
import { Button } from "@/shared/components/ui/button";

// `closable`: a reference pane. It shows a close button and leaves the page title alone.
// `open`: opens a reference of this pane to its right.
// `previewing`: the pane sits next to the preview, so it shows no preview button.
const props = withDefaults(
  defineProps<{
    name: string;
    id: string;
    closable?: boolean;
    open?: (collection: string, id: string) => void;
    previewing?: boolean;
    min?: number;
    max?: number;
    grow?: boolean;
    width?: number;
    handle?: "left" | "right";
  }>(),
  { min: 448, grow: true, width: undefined, handle: "right" },
);
// `saved`: after every save, draft save, publish and discard.
const emit = defineEmits<{
  close: [];
  deleted: [];
  saved: [];
  change: [data: Record<string, unknown>];
}>();
// `doc` is the latest saved document. `initial` is what the form shows; a draft save leaves it, so typing goes on.
const doc = ref<Record<string, unknown> | null>(null);
const initial = ref<Record<string, unknown>>({});

const router = useRouter();
const reload = inject(reloadKey, () => {});
const keepPane = inject(keepPaneKey, () => {});
if (props.open) provide(openRefKey, props.open);
// A new document gets its id from its first draft save and keeps this pane.
const docId = ref(props.id);
const isNew = computed(() => docId.value === "new");
const collection = computed(() => schema.value.collections?.[props.name]);
const drafts = computed(() => collection.value?.drafts !== false);
// The Published view shows the live version. An edit there would replace the pending draft, so the form is inert.
const readOnly = computed(() => drafts.value && usePerspective().perspective === "published");
const formId = `doc-${props.name}-${props.id}`;
const error = ref("");

// Joins are read-only. One request resolves all of them.
const joins = computed(() =>
  Object.entries(collection.value?.fields ?? {}).flatMap(([key, f]) =>
    f.type === "join" ? [{ key, field: f }] : [],
  ),
);
const joined = ref<Record<string, Record<string, any>[]>>({});
const label = (collection: string, d: Record<string, any>) => {
  const c = schema.value.collections?.[collection];
  return String((c && d[titleField(c)]) || d.id);
};

const title = () =>
  isNew.value
    ? `New ${collection.value?.label ?? props.name}`
    : String((collection.value && doc.value?.[titleField(collection.value)]) || "Untitled");

if (!props.closable) useHead({ title });

function show(d: Record<string, unknown>) {
  doc.value = d;
  initial.value = d;
}

if (isNew.value) doc.value = {};
else {
  client.findById(props.name, props.id, { populate: false }).then(show);
  if (joins.value.length) {
    const populate = Object.fromEntries(joins.value.map((j) => [j.key, true]));
    client.findById(props.name, props.id, { populate }).then((d) => (joined.value = d));
  }
}

async function save(data: Data<Fields>) {
  if (isNew.value) {
    const created = await client.create(props.name, data);
    reload();
    emit("saved");
    await router.replace(`${CONTENT}/collections/${props.name}/${created.id}`);
  } else {
    show(await client.update(props.name, docId.value, data));
    reload();
    emit("saved");
  }
}

async function saveDraft(data: Data<Fields>) {
  if (isNew.value) {
    doc.value = await client.createDraft(props.name, data);
    docId.value = doc.value.id as string;
    // The save MAY resolve after the user left, e.g. through the flush on blur or unmount. Then the route stays.
    const { params } = router.currentRoute.value;
    if (params.name === props.name && params.id === "new") {
      keepPane(docId.value);
      await router.replace(`${CONTENT}/collections/${props.name}/${docId.value}`);
    }
  } else doc.value = await client.updateDraft(props.name, docId.value, data);
  reload();
  emit("saved");
}

async function publish() {
  show(await client.publish(props.name, docId.value));
  reload();
  emit("saved");
}

// A document that was never published is deleted.
async function discard() {
  const kept = await client.discard(props.name, docId.value);
  reload();
  emit("saved");
  if (kept) show(kept);
  else emit("deleted");
}

async function remove() {
  if (!confirm("Delete this entry?")) return;
  error.value = "";
  try {
    await client.delete(props.name, docId.value);
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  reload();
  emit("deleted");
}
</script>

<template>
  <Pane
    v-if="collection"
    :title="title()"
    :min="min"
    :max="max"
    :grow="grow"
    :width="width"
    :handle="handle"
    :collapsible="false"
  >
    <template #actions>
      <Button
        v-if="collection.preview && !previewing && !isNew"
        as-child
        variant="ghost"
        size="icon-sm"
        aria-label="Preview"
      >
        <RouterLink :to="`/presentation/collections/${name}/${docId}`"
          ><Icon name="eye"
        /></RouterLink>
      </Button>
      <slot name="actions" />
      <Button
        v-if="closable"
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        @click="emit('close')"
      >
        <Icon name="x" />
      </Button>
    </template>
    <div v-if="doc" class="flex min-h-full flex-col">
      <header class="mx-auto w-full max-w-2xl px-4 pt-8 pb-6">
        <p class="text-muted-foreground text-xs">{{ collection.label ?? name }}</p>
        <h1 class="mt-1 text-2xl font-semibold">{{ title() }}</h1>
        <StatusBadges v-if="drafts" :doc="doc" />
        <p v-if="readOnly" class="text-muted-foreground mt-2 text-sm">
          Published version. Switch to Drafts to edit.
        </p>
        <p v-if="collection.description" class="text-muted-foreground mt-2 text-sm">
          {{ collection.description }}
        </p>
        <template v-if="!isNew">
          <section v-for="j in joins" :key="j.key" class="mt-4">
            <h2 class="text-muted-foreground mb-1 text-xs">{{ j.field.label ?? j.key }}</h2>
            <ul class="divide-border border-border bg-card divide-y rounded-lg border">
              <li v-for="d in joined[j.key] ?? []" :key="d.id">
                <button
                  type="button"
                  class="hover:bg-muted flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                  @click="open?.(j.field.collection, d.id)"
                >
                  {{ label(j.field.collection, d) }}
                  <Icon name="arrow-up-right" class="text-muted-foreground" />
                </button>
              </li>
              <li v-if="!joined[j.key]?.length" class="text-muted-foreground px-3 py-2 text-sm">
                Nothing linked.
              </li>
            </ul>
          </section>
        </template>
      </header>
      <DocForm
        :id="formId"
        class="flex-1 inert:opacity-60"
        :fields="collection.fields"
        :initial="initial"
        :doc="doc"
        :inert="readOnly"
        v-bind="drafts ? { saveDraft, publish, discard } : { save }"
        :is-new="props.id === 'new'"
        @change="emit('change', $event)"
      >
        <Button v-if="!isNew" type="button" variant="ghost" size="sm" @click="remove">
          Delete
        </Button>
        <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      </DocForm>
    </div>
  </Pane>
</template>
