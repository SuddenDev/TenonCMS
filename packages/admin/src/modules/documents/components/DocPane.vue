<script setup lang="ts">
import { withLinkedDeletion, DeletionCancelled } from "@/shared/linked-deletion";
import PaneExpandButton from "@/shared/components/pane/PaneExpandButton.vue";
import { CONTENT } from "@/shared/options";
import { useHead } from "@unhead/vue";
import { computed, inject, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { useRouter } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import { can } from "@/shared/access";
import {
  keepPaneKey,
  openRefKey,
  ownerKey,
  reloadKey,
  titleField,
} from "@/modules/documents/fields";
import DocForm from "@/modules/documents/components/DocForm.vue";
import DocActions from "@/modules/documents/components/DocActions.vue";
import VersionHistory from "@/modules/documents/components/VersionHistory.vue";
import StatusBadges from "@/modules/documents/components/StatusBadges.vue";
import { useTranslations } from "@/modules/documents/composables/useTranslations";
import { useLock } from "@/modules/documents/composables/useLock";
import LockNotice from "@/modules/documents/components/LockNotice.vue";
import { Pane, Icon, useLocale, usePerspective } from "@/shared";
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
const { t } = useI18n();
const doc = ref<Record<string, unknown> | null>(null);
const initial = ref<Record<string, unknown>>({});

const router = useRouter();
const reload = inject(reloadKey, () => {});
const keepPane = inject(keepPaneKey, () => {});
if (props.open) provide(openRefKey, props.open);
// A new document gets its id from its first draft save and keeps this pane.
const docId = ref(props.id);
const isNew = computed(() => docId.value === "new");
// Custom fields load their server data for this document. A new one has no id until its first draft save.
provide(
  ownerKey,
  computed(() => ({ collection: props.name, ...(isNew.value ? {} : { id: docId.value }) })),
);
const collection = computed(() => schema.value.collections?.[props.name]);
const drafts = computed(() => collection.value?.drafts !== false);
// The Published view shows the live version. An edit there would replace the pending draft, so the form is inert.
const published = computed(() => drafts.value && usePerspective().perspective === "published");
// The form is inert, too, when the user MAY NOT create or change the document.
const editable = computed(() =>
  can(collection.value, isNew.value ? "create" : "update", doc.value ?? undefined),
);
// One editor at a time: the form is inert while someone else holds the lock.
const lock = useLock({
  claim: (takeover) => client.lock(props.name, docId.value, { takeover }),
  release: () => client.unlock(props.name, docId.value),
  active: () => !isNew.value && !published.value && editable.value,
  onRegain: load,
});
const readOnly = computed(() => published.value || !editable.value || !!lock.holder.value);
const formId = `doc-${props.name}-${props.id}`;
const error = ref("");

const { locale, defaultLocale, flush } = useLocale();
// The languages of a localized collection. A new document has no languages to compare until its first save.
const tr = useTranslations(
  () => collection.value,
  () => (isNew.value ? null : { collection: props.name, id: docId.value }),
  () => doc.value,
);
const languages = computed(() =>
  tr.localized.value && tr.loaded.value ? tr.status.value : undefined,
);

// Joins are read-only. One request resolves all of them. A join the user MAY NOT read is left out.
const joins = computed(() =>
  Object.entries(collection.value?.fields ?? {}).flatMap(([key, f]) =>
    f.type === "join" && can(f, "read") ? [{ key, field: f }] : [],
  ),
);
const joined = ref<Record<string, Record<string, any>[]>>({});
const label = (collection: string, d: Record<string, any>) => {
  const c = schema.value.collections?.[collection];
  return String((c && d[titleField(c)]) || d.id);
};

const title = () =>
  isNew.value
    ? t("documents.newTitle", { type: text(collection.value?.label) ?? props.name })
    : String(
        (collection.value &&
          (doc.value?.[titleField(collection.value)] ||
            tr.defaults.value?.[titleField(collection.value)])) ||
          t("documents.untitled"),
      );

if (!props.closable) useHead({ title });

function show(d: Record<string, unknown>) {
  doc.value = d;
  initial.value = d;
}

// Loads the document in the active language. A later load wins, so a quick language switch shows the last one.
let loads = 0;
async function load() {
  const at = ++loads;
  if (isNew.value) {
    doc.value = {};
    return;
  }

  const id = docId.value;
  const d = await client.findById(props.name, id, { populate: false, ...tr.read() });
  if (at !== loads) return;

  show(d);
  tr.refresh();

  if (joins.value.length) {
    const populate = Object.fromEntries(joins.value.map((j) => [j.key, true]));
    client.findById(props.name, id, { populate, ...tr.read() }).then((j) => {
      if (at === loads) joined.value = j;
    });
  }
}
load();

// The form unmounts meanwhile, so no edit lands in the wrong language. The history is per language, so it closes.
watch(tr.active, () => {
  doc.value = null;
  history.value = false;
  load();
});

// The history replaces the form. Pending edits save first, so a restore cannot be overwritten by them.
const history = ref(false);
async function openHistory() {
  await flush();
  history.value = true;
}

async function restoreVersion(version: string) {
  await client.restoreVersion(props.name, docId.value, version);
  history.value = false;
  await load();
  reload();
  emit("saved");
}

// A write sends the `updatedAt` it builds on, so a newer save of someone else answers 409.
const saveOptions = () => ({
  ...tr.write(),
  updatedAt: doc.value?.updatedAt as string | undefined,
});

async function save(data: Data<Fields>) {
  if (isNew.value) {
    const created = await client.create(props.name, data, tr.write());

    reload();
    emit("saved");
    await router.replace(`${CONTENT}/collections/${props.name}/${created.id}`);
  } else {
    show(await client.update(props.name, docId.value, data, saveOptions()));
    reload();
    emit("saved");
  }
}

async function saveDraft(data: Data<Fields>) {
  const first = isNew.value || (languages.value?.active ?? "") === "missing";

  if (isNew.value) {
    doc.value = await client.createDraft(props.name, data, tr.write());
    docId.value = doc.value.id as string;

    // The save MAY resolve after the user left, e.g. through the flush on blur or unmount. Then the route stays.
    const { params } = router.currentRoute.value;
    if (params.name === props.name && params.id === "new") {
      keepPane(docId.value);
      await router.replace(`${CONTENT}/collections/${props.name}/${docId.value}`);
    }
  } else doc.value = await client.updateDraft(props.name, docId.value, data, saveOptions());

  // The first save of a language creates its row.
  if (first) tr.refresh();
  reload();
  emit("saved");
}

async function publish() {
  show(await client.publish(props.name, docId.value, saveOptions()));
  tr.refresh();
  reload();
  emit("saved");
}

// A document that was never published is deleted.
async function discard() {
  const kept = await withLinkedDeletion((options) =>
    client.discard(props.name, docId.value, { ...tr.write(), ...options }),
  );

  reload();
  emit("saved");

  if (kept) {
    show(kept);
    tr.refresh();
  } else emit("deleted");
}

// A language action saves the pending edit first, so no autosave lands after it.
async function translate(action: () => Promise<void>) {
  error.value = "";

  try {
    await flush();
    await action();
    reload();
    emit("saved");
  } catch (e) {
    if (e instanceof DeletionCancelled) return;

    error.value = (e as Error).message;
  }
}

const copy = (from: string, to: string) =>
  translate(async () => {
    await tr.copy(from, to);
    if (to === tr.active.value) await load();
    else await tr.refresh();
  });

const removeLocale = (l: string) =>
  translate(async () => {
    await tr.remove(l);
    // The active language is gone: the switch loads the default one.
    locale.value = defaultLocale.value;
  });

const discardAll = () =>
  translate(async () => {
    if ((await tr.discardAll()) === null) emit("deleted");
    else await load();
  });

async function remove() {
  if (!confirm(t("documents.deleteConfirm"))) return;

  error.value = "";

  try {
    await withLinkedDeletion((options) => client.delete(props.name, docId.value, options));
  } catch (e) {
    if (e instanceof DeletionCancelled) return;

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
    <template #title>
      <div class="min-w-0 flex-1">
        <h2 :class="drafts ? 'sr-only' : 'truncate text-sm font-medium'">{{ title() }}</h2>
        <StatusBadges v-if="doc && drafts" :doc="doc" :languages="languages" />
      </div>
    </template>
    <template #actions="{ expanded, toggleExpand }">
      <Button
        v-if="collection.preview && !previewing && !isNew"
        as-child
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.preview')"
      >
        <RouterLink :to="`/presentation/collections/${name}/${docId}`"
          ><Icon name="eye"
        /></RouterLink>
      </Button>
      <DocActions
        :history="!isNew && editable && !history"
        :languages="readOnly ? undefined : languages"
        :locale="tr.active.value"
        :default-locale="defaultLocale"
        @history="openHistory"
        @copy="copy"
        @remove="removeLocale"
        @discard-all="discardAll"
      />
      <PaneExpandButton :expanded="expanded" @toggle="toggleExpand" />
      <slot name="actions" />
      <Button
        v-if="closable"
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <Icon name="x" />
      </Button>
    </template>
    <VersionHistory
      v-if="doc && history"
      :fields="collection.fields"
      :layout="collection"
      :list="() => client.versions(name, docId, tr.write())"
      :get="(v) => client.version(name, docId, v)"
      :restore="restoreVersion"
      :drafts="drafts"
      :can-restore="!readOnly"
      @close="history = false"
    />
    <div v-else-if="doc" class="flex min-h-full flex-col">
      <header
        class="mx-auto w-full max-w-2xl px-6 pt-10 pb-8 group-data-[expanded=true]/pane:max-w-none sm:px-8"
      >
        <p class="text-muted-foreground text-xs">{{ text(collection.label) ?? name }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">{{ title() }}</h1>
        <LockNotice
          v-if="lock.holder.value"
          :holder="lock.holder.value"
          :lost="lock.lost.value"
          @takeover="lock.takeOver"
        />
        <p v-else-if="readOnly" class="text-muted-foreground mt-2 text-sm">
          {{ t(editable ? "documents.readOnly" : "documents.noEdit") }}
        </p>
        <p v-if="collection.description" class="text-muted-foreground mt-2 text-sm">
          {{ text(collection.description) }}
        </p>
        <template v-if="!isNew">
          <section v-for="j in joins" :key="j.key" class="mt-4">
            <h2 class="text-muted-foreground mb-1 text-xs">{{ text(j.field.label) ?? j.key }}</h2>
            <ul class="divide-border border-border divide-y rounded-md border">
              <li v-for="d in joined[j.key] ?? []" :key="d.id">
                <Button
                  type="button"
                  variant="ghost"
                  class="h-auto w-full justify-between rounded-none px-3 py-2 font-normal"
                  @click="open?.(j.field.collection, d.id)"
                >
                  {{ label(j.field.collection, d) }}
                  <Icon name="arrow-up-right" class="text-muted-foreground" />
                </Button>
              </li>
              <li v-if="!joined[j.key]?.length" class="text-muted-foreground px-3 py-2 text-sm">
                {{ t("documents.nothingLinked") }}
              </li>
            </ul>
          </section>
        </template>
      </header>
      <DocForm
        :id="formId"
        class="flex-1 inert:opacity-60"
        :fields="collection.fields"
        :layout="collection"
        :initial="initial"
        :doc="doc"
        :inert="readOnly"
        v-bind="drafts ? { saveDraft, publish, discard } : { save }"
        :is-new="props.id === 'new'"
        :localized="tr.localized.value"
        :defaults="tr.defaults.value"
        :missing="languages?.active === 'missing'"
        :reload="load"
        @change="emit('change', $event)"
      >
        <Button
          v-if="!isNew && can(collection, 'delete', doc)"
          type="button"
          variant="ghost"
          size="sm"
          @click="remove"
        >
          {{ t("common.delete") }}
        </Button>
        <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      </DocForm>
    </div>
  </Pane>
</template>
