<script setup lang="ts">
import { ref, watch } from "vue";
import { CmsError, type Data, type Fields } from "@/shared/api";
import { active, isEmpty } from "@/modules/documents/fields";
import FieldInput from "./FieldInput.vue";

// `isNew`: plain `default` values pre-fill the form, and slugs follow their `from` field. Function defaults are not in the schema; the server fills them.
const props = defineProps<{
  fields: Fields;
  initial: Record<string, unknown>;
  save: (data: Data<Fields>) => Promise<void>;
  isNew?: boolean;
}>();

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
// The saved document MAY differ from the input, e.g. when hooks change it, so the form shows what was stored.
watch(
  () => props.initial,
  (initial) => (data.value = normalize(props.fields, initial, false, props.isNew)),
);
const error = ref("");
// Messages by field path from a 400 response.
const errors = ref<Record<string, string>>({});
const saved = ref(false);
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = "";
  errors.value = {};
  saved.value = false;
  try {
    // Fields can change after mount, so the payload follows the current fields.
    await props.save(normalize(props.fields, data.value, true) as Data<Fields>);
    saved.value = true;
  } catch (e) {
    errors.value = (e instanceof CmsError && e.body?.errors) || {};
    const fieldErrors = Object.keys(errors.value).some((key) => key !== "");
    error.value =
      errors.value[""] ?? (fieldErrors ? "Please fix the marked fields" : (e as Error).message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="flex max-w-2xl flex-col gap-4" @submit.prevent="submit">
    <template v-for="(field, name) in fields" :key="name">
      <FieldInput
        v-if="active(field, data, data)"
        v-model="data[name]"
        :name="String(name)"
        :field="field"
        :root="data"
        :siblings="{ fields, data }"
        :is-new="isNew"
        :errors="errors"
      />
    </template>
    <div class="flex items-center gap-3">
      <button class="btn" :disabled="busy">Save</button>
      <slot />
      <span v-if="saved" class="text-sm text-green-700" role="status">Saved</span>
      <span v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</span>
    </div>
  </form>
</template>
