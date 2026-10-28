<script setup lang="ts">
import { DeletionCancelled } from "@/shared/linked-deletion";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { CmsError, type Data, type Field, type Fields, type Layout } from "@/shared/api";
import { onLocaleFlush } from "@/shared/composables/useLocale";
import { active, normalize } from "@/modules/documents/fields";
import { ago } from "@/shared/utils";
import { Button } from "@/shared/components/ui/button";
import FieldInput from "./FieldInput.vue";
import FieldLayout from "./fields/FieldLayout.vue";
import { useAutosave } from "@/modules/documents/composables/useAutosave";
import Icon from "@/shared/components/Icon.vue";

// `isNew`: plain `default` values pre-fill the form, and slugs follow their `from` field. Function defaults are not in the schema; the server fills them.
// `id`: the form's id, so a button outside of it can submit it with `form`.
// The form fills its pane: fields in a centered column, the status bar stuck to the bottom.
// With `saveDraft` the entry has drafts: edits save as a draft on their own, and `publish` and `discard` act on it.
// Without it, `save` runs on submit.
// `doc`: the latest saved document, for the status bar. Defaults to `initial`.
// `global`: the form edits a global. A discard never deletes it.
// `localized`: the entry has languages. Its fields marked `localized: false` are labeled as shared.
// `defaults`: the default language's data. Empty localized fields show its values as placeholders.
// `missing`: the active language has no version yet, so there is nothing to publish before the first edit.
// `layout`: the tabs and fieldsets of the collection or global.
// `reload`: loads the stored document again. It is offered when a save answers 409 because someone else saved first.
const props = defineProps<{
  id?: string;
  fields: Fields;
  layout?: Layout;
  initial: Record<string, unknown>;
  save?: (data: Data<Fields>) => Promise<void>;
  saveDraft?: (data: Data<Fields>) => Promise<void>;
  publish?: () => Promise<void>;
  discard?: () => Promise<void>;
  doc?: Record<string, unknown>;
  isNew?: boolean;
  global?: boolean;
  localized?: boolean;
  defaults?: Record<string, unknown>;
  missing?: boolean;
  reload?: () => unknown;
}>();
// `change`: the form state as it would be saved, on every edit and once on load.
const emit = defineEmits<{ change: [data: Record<string, unknown>] }>();
const { t, locale } = useI18n();

const data = ref(normalize(props.fields, props.initial, false, props.isNew));
// Fields can change after mount, so the payload follows the current fields.
const payload = () => normalize(props.fields, data.value, true) as Data<Fields>;
const drafts = !!props.saveDraft;
const current = computed(() => props.doc ?? props.initial);
// The payload of the last draft save, or of the loaded document. Only an edit that differs from it saves.
let sent = JSON.stringify(payload());
const autosave = useAutosave(async () => {
  const body = payload();
  sent = JSON.stringify(body);
  await props.saveDraft!(body);
});
const { pending, saving } = autosave;
// A language switch saves the pending edit first.
if (drafts)
  onLocaleFlush(async () => {
    await autosave.flush();
    return !autosave.pending.value;
  });
const shared = (f: Field) => !!props.localized && f.localized === false;
const inherited = (f: Field) =>
  props.localized && f.localized !== false ? props.defaults : undefined;
// The saved document MAY differ from the input, e.g. when hooks change it, so the form shows what was stored.
watch(
  () => props.initial,
  (initial) => {
    data.value = normalize(props.fields, initial, false, props.isNew);
    sent = JSON.stringify(payload());
  },
);
watch(
  data,
  () => {
    const body = payload();
    emit("change", body);
    if (drafts && JSON.stringify(body) !== sent) autosave.schedule();
  },
  { deep: true, immediate: true },
);
const error = ref("");
// Messages by field path from a 400 response.
const errors = ref<Record<string, string>>({});
const saved = ref(false);
const busy = ref(false);

// Not disabled while a draft saves: the blur of a click on Publish starts a save, which would swallow the click.
// Publish waits for that save instead.
// Pending shared fields are published with any language.
const canPublish = computed(
  () =>
    pending.value ||
    !!current.value.hasDraft ||
    current.value.sharedDraft === true ||
    (current.value.publishedAt === null && !props.missing),
);

// Someone else saved since this form loaded, so the save or publish answered 409 with `code: "CHANGED"`.
const isConflict = (e: unknown) =>
  e instanceof CmsError && e.status === 409 && e.body?.code === "CHANGED";
const conflict = ref(false);
const conflicted = computed(() => conflict.value || isConflict(autosave.error.value));

// Runs `action` with the busy state. A 400 marks the fields by path.
async function attempt(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  errors.value = {};
  saved.value = false;
  conflict.value = false;

  try {
    await action();
  } catch (e) {
    if (e instanceof DeletionCancelled) return;
    if (isConflict(e)) {
      conflict.value = true;
      return;
    }

    errors.value = (e instanceof CmsError && e.body?.errors) || {};
    const fieldErrors = Object.keys(errors.value).some((key) => key !== "");
    error.value =
      errors.value[""] ?? (fieldErrors ? t("documents.fixFields") : (e as Error).message);
  } finally {
    busy.value = false;
  }
}

// Drops the unsaved edits and the error, then loads what is stored.
async function reloadStored() {
  autosave.pending.value = false;
  autosave.error.value = null;
  conflict.value = false;
  error.value = "";
  await props.reload!();
}

const submit = () =>
  attempt(async () => {
    await props.save!(payload());
    saved.value = true;
  });

// Publish and discard wait for the draft first, so a save in flight cannot land after them.
const publish = () =>
  attempt(async () => {
    await autosave.flush();
    if (autosave.error.value) throw autosave.error.value;

    await props.publish!();
  });

async function discard() {
  const message = t(
    current.value.publishedAt || props.global
      ? "documents.discardPublished"
      : props.localized
        ? "documents.discardLocale"
        : "documents.discardNew",
  );
  if (!confirm(message)) return;

  await attempt(async () => {
    await autosave.flush();
    await props.discard!();
  });
}
</script>

<template>
  <form
    :id="id"
    class="flex min-h-full flex-col"
    @submit.prevent="drafts ? autosave.flush() : submit()"
    @focusout="drafts && autosave.flush()"
  >
    <div
      class="mx-auto flex w-full max-w-2xl flex-col px-6 pb-12 group-data-[expanded=true]/pane:max-w-none sm:px-8"
    >
      <FieldLayout
        split
        :fields="fields"
        :layout="layout"
        :show="(_, f) => active(f, data, data)"
        :errors="errors"
      >
        <template #field="{ name, field }">
          <FieldInput
            v-model="data[name]"
            :name="name"
            :field="field"
            :root="data"
            :siblings="{ fields, data }"
            :is-new="isNew"
            :errors="errors"
            :shared="shared(field)"
            :placeholders="inherited(field)"
          />
        </template>
      </FieldLayout>
    </div>
    <footer
      class="bg-background border-border sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3"
    >
      <template v-if="conflicted">
        <span class="text-destructive text-sm" role="alert">{{ t("documents.conflict") }}</span>
        <Button v-if="reload" type="button" variant="outline" size="sm" @click="reloadStored">
          {{ t("documents.reload") }}
        </Button>
      </template>
      <span v-else-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      <template v-else-if="drafts">
        <span v-if="autosave.error.value" class="text-destructive text-sm" role="alert">
          {{ (autosave.error.value as Error).message }}
        </span>
        <span v-else-if="saving" class="text-muted-foreground text-sm" role="status">{{
          t("documents.saving")
        }}</span>
        <span v-else-if="current.hasDraft" class="text-muted-foreground text-sm" role="status">
          {{ t("documents.draftSaved", { ago: ago(current.updatedAt as string, locale) }) }}
        </span>
        <span v-else-if="current.publishedAt" class="text-muted-foreground text-sm">
          {{ t("documents.publishedAgo", { ago: ago(current.publishedAt as string, locale) }) }}
        </span>
      </template>
      <span v-else-if="saved" class="text-muted-foreground text-sm" role="status">{{
        t("common.saved")
      }}</span>
      <span v-else-if="initial.updatedAt" class="text-muted-foreground text-sm">
        {{ t("documents.edited", { ago: ago(initial.updatedAt as string, locale) }) }}
      </span>
      <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
        <slot />
        <template v-if="drafts">
          <Button
            v-if="current.hasDraft"
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="discard"
          >
            {{ t("documents.discardChanges") }}
          </Button>
          <Button type="button" size="sm" :disabled="busy || !canPublish" @click="publish">
            <Icon name="upload" />
            {{ t("documents.publish") }}
          </Button>
        </template>
        <Button v-else type="submit" size="sm" :disabled="busy">{{ t("common.save") }}</Button>
      </div>
    </footer>
  </form>
</template>
