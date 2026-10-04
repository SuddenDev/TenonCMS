<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CmsError, type Data, type Fields } from "@/shared/api";
import { active, isEmpty } from "@/modules/documents/fields";
import { ago } from "@/shared/utils";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { FieldError } from "@/shared/components/ui/field";
import FieldInput from "./FieldInput.vue";
import { useAutosave } from "@/modules/documents/composables/useAutosave";

// `isNew`: plain `default` values pre-fill the form, and slugs follow their `from` field. Function defaults are not in the schema; the server fills them.
// `id`: the form's id, so a button outside of it can submit it with `form`.
// The form fills its pane: fields in a centered column, the status bar stuck to the bottom.
// With `saveDraft` the entry has drafts: edits save as a draft on their own, and `publish` and `discard` act on it.
// Without it, `save` runs on submit.
// `doc`: the latest saved document, for the status bar. Defaults to `initial`.
// `global`: the form edits a global. A discard never deletes it.
const props = defineProps<{
  id?: string;
  fields: Fields;
  initial: Record<string, unknown>;
  save?: (data: Data<Fields>) => Promise<void>;
  saveDraft?: (data: Data<Fields>) => Promise<void>;
  publish?: () => Promise<void>;
  discard?: () => Promise<void>;
  doc?: Record<string, unknown>;
  isNew?: boolean;
  global?: boolean;
}>();
// `change`: the form state as it would be saved, on every edit and once on load.
const emit = defineEmits<{ change: [data: Record<string, unknown>] }>();

// Groups always render as objects, so their inputs have a model to bind to.
// On save, an optional group with only empty values becomes null, so its required children do not apply.
// Empty strings become null, so cleared optional fields pass validation.
// Joins are not stored, so they stay out of the form data.
// `fill`: use defaults for missing values. Like on the server, children of an optional group get them only when the group has a value.
// On save, a field whose condition is false becomes null. Conditions read the form data as it is, so '' and null count the same.
function normalize(
  fields: Fields,
  value: Record<string, any> | null | undefined,
  save = false,
  fill = false,
  root: unknown = value,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([k, f]) => {
      if (f.type === "join") return [];
      if (save && !active(f, root, value)) return [[k, null]];
      const v = value?.[k] === undefined && fill ? structuredClone(f.default) : value?.[k];
      if (f.type === "group") {
        const g = normalize(f.fields, v, save, fill && (f.required || v != null), root);
        return [[k, save && !f.required && isEmpty(g) ? null : g]];
      }
      if (f.type === "boolean") return [[k, v ?? false]];
      if ((f.type === "relation" || f.type === "image" || f.type === "file") && f.many)
        return [[k, v ?? []]];
      return [[k, v === "" || v === undefined ? null : v]];
    }),
  );
}

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
// Top-level fields without a group share one card. Each group is its own card.
const plain = computed(() =>
  Object.entries(props.fields).filter(([, f]) => f.type !== "group" && f.type !== "join"),
);
const groups = computed(() =>
  Object.entries(props.fields).flatMap(([name, field]) =>
    field.type === "group" ? [{ name, field }] : [],
  ),
);
const error = ref("");
// Messages by field path from a 400 response.
const errors = ref<Record<string, string>>({});
const saved = ref(false);
const busy = ref(false);

// Not disabled while a draft saves: the blur of a click on Publish starts a save, which would swallow the click.
// Publish waits for that save instead.
const canPublish = computed(
  () => pending.value || !!current.value.hasDraft || current.value.publishedAt === null,
);

// Runs `action` with the busy state. A 400 marks the fields by path.
async function attempt(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  errors.value = {};
  saved.value = false;
  try {
    await action();
  } catch (e) {
    errors.value = (e instanceof CmsError && e.body?.errors) || {};
    const fieldErrors = Object.keys(errors.value).some((key) => key !== "");
    error.value =
      errors.value[""] ?? (fieldErrors ? "Please fix the marked fields" : (e as Error).message);
  } finally {
    busy.value = false;
  }
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
  const message =
    current.value.publishedAt || props.global
      ? "Discard the unpublished changes?"
      : "Discard this draft? It was never published, so the entry is deleted.";
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
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-6">
      <Card v-if="plain.some(([, f]) => active(f, data, data))" class="gap-0 py-0">
        <CardContent class="divide-border flex flex-col divide-y *:py-4">
          <template v-for="[name, field] in plain" :key="name">
            <FieldInput
              v-if="active(field, data, data)"
              v-model="data[name]"
              :name="name"
              :field="field"
              :root="data"
              :siblings="{ fields, data }"
              :is-new="isNew"
              :errors="errors"
            />
          </template>
        </CardContent>
      </Card>
      <template v-for="{ name, field } in groups" :key="name">
        <Card v-if="active(field, data, data)" class="gap-0 py-0">
          <fieldset :disabled="field.readOnly" class="contents">
            <CardHeader class="py-4">
              <CardTitle>
                {{ field.label ?? name }}
                <span v-if="field.required" class="text-destructive" aria-hidden="true">*</span>
              </CardTitle>
              <CardDescription v-if="field.description">{{ field.description }}</CardDescription>
              <FieldError v-if="errors[name]">{{ errors[name] }}</FieldError>
            </CardHeader>
            <CardContent class="divide-border border-border flex flex-col divide-y border-t *:py-4">
              <template v-for="(child, key) in field.fields" :key="key">
                <FieldInput
                  v-if="active(child, data, data[name] as Record<string, unknown>)"
                  v-model="(data[name] as Record<string, unknown>)[key]"
                  :name="String(key)"
                  :field="child"
                  :root="data"
                  :siblings="{ fields: field.fields, data: data[name] as Record<string, unknown> }"
                  :is-new="isNew"
                  :loose="!field.required && isEmpty(data[name] as Record<string, unknown>)"
                  :path="`${name}.${key}`"
                  :errors="errors"
                />
              </template>
            </CardContent>
          </fieldset>
        </Card>
      </template>
    </div>
    <footer
      class="bg-background border-border sticky bottom-0 mt-auto flex items-center gap-3 border-t px-4 py-2"
    >
      <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      <template v-else-if="drafts">
        <span v-if="autosave.error.value" class="text-destructive text-sm" role="alert">
          {{ (autosave.error.value as Error).message }}
        </span>
        <span v-else-if="saving" class="text-muted-foreground text-sm" role="status">Saving…</span>
        <span v-else-if="current.hasDraft" class="text-muted-foreground text-sm" role="status">
          Draft saved {{ ago(current.updatedAt as string) }}
        </span>
        <span v-else-if="current.publishedAt" class="text-muted-foreground text-sm">
          Published {{ ago(current.publishedAt as string) }}
        </span>
      </template>
      <span v-else-if="saved" class="text-muted-foreground text-sm" role="status">Saved</span>
      <span v-else-if="initial.updatedAt" class="text-muted-foreground text-sm">
        Edited {{ ago(initial.updatedAt as string) }}
      </span>
      <div class="ml-auto flex items-center gap-2">
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
            Discard changes
          </Button>
          <Button type="button" size="sm" :disabled="busy || !canPublish" @click="publish">
            Publish
          </Button>
        </template>
        <Button v-else type="submit" size="sm" :disabled="busy">Save</Button>
      </div>
    </footer>
  </form>
</template>
