<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { CmsError, type Data, type Fields } from "@/shared/api";
import { active, isEmpty } from "@/modules/documents/fields";
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

// `isNew`: plain `default` values pre-fill the form, and slugs follow their `from` field. Function defaults are not in the schema; the server fills them.
// `id`: the form's id, so a button outside of it can submit it with `form`.
const props = defineProps<{
  id?: string;
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
  <form :id="id" class="flex max-w-3xl flex-col gap-6" @submit.prevent="submit">
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
    <div class="flex items-center gap-3">
      <span v-if="saved" class="text-muted-foreground text-sm" role="status">Saved</span>
      <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      <div class="ml-auto flex items-center gap-3">
        <slot />
        <Button type="submit" :disabled="busy">Save</Button>
      </div>
    </div>
  </form>
</template>
