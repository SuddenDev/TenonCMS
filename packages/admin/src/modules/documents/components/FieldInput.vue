<script setup lang="ts">
import {
  type ComponentPublicInstance,
  computed,
  inject,
  ref,
  useId,
  useTemplateRef,
  watch,
} from "vue";
import { client, type Field, type Fields, SLUG_PATTERN, schema, slugify } from "@/shared/api";
import {
  active,
  focusKey,
  isEmpty,
  openRefKey,
  ownerKey,
  titleField,
} from "@/modules/documents/fields";
import { useExtensionData } from "@/shared/composables/useExtensionData";
import MediaField from "@/modules/media/components/MediaField.vue";
import Icon from "@/shared/components/Icon.vue";
import SharedMarker from "@/modules/documents/components/SharedMarker.vue";
import Mount from "@/shared/components/Mount.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Field as FieldBox,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/shared/components/ui/field";

// `loose`: the field sits in an optional group that is empty, so `required` does not apply yet.
// `path`: dot path of the field, the key of its message in `errors`. Defaults to `name`.
// `root`: the whole form data, for conditions of group children.
// `siblings`: the fields and data of the object that holds this field. A slug reads `from` and `parent` there.
// `isNew`: the document is not saved yet.
// `shared`: the field is the same in all languages of a localized entry, which the label says.
// `placeholders`: the default language's data of the object that holds the field. An empty field shows its value muted.
const props = defineProps<{
  name: string;
  field: Field;
  root: Record<string, unknown>;
  siblings: { fields: Fields; data: Record<string, unknown> };
  isNew?: boolean;
  loose?: boolean;
  path?: string;
  errors?: Record<string, string>;
  shared?: boolean;
  placeholders?: Record<string, unknown>;
}>();
const model = defineModel<any>();
const id = useId();
const path = computed(() => props.path ?? props.name);
const message = computed(() => props.errors?.[path.value]);
const invalid = computed(() => (message.value ? true : undefined));
const required = computed(() => props.field.required && !props.loose);
// Built-in checks and `readOnly` as HTML attributes. Vue drops `undefined` ones, and browsers ignore those an input does not support.
const attrs = computed(() => {
  const f = props.field as Record<string, any>;
  const inherited = props.placeholders?.[props.name];
  return {
    required: required.value,
    disabled: f.readOnly,
    placeholder:
      typeof inherited === "string" || typeof inherited === "number"
        ? String(inherited)
        : f.placeholder,
    minlength: f.minLength,
    maxlength: f.maxLength,
    pattern: f.pattern,
    min: f.min,
    max: f.max,
  };
});
// Runs after render, so the field's element exists when it mounts with a matching path.
const box = useTemplateRef<ComponentPublicInstance>("box");
const focus = inject(focusKey, undefined);
watch(
  () => focus?.value,
  (target) => {
    const el = box.value?.$el as HTMLElement | undefined;
    if (!focus || target !== path.value || !el) return;
    focus.value = null;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({
      preventScroll: true,
    });
  },
  { immediate: true, flush: "post" },
);
const customType = props.field.type.startsWith("custom:") ? props.field.type.slice(7) : undefined;
const registered = schema.value.admin?.fields;
const custom =
  customType && registered && Object.hasOwn(registered, customType)
    ? registered[customType]
    : undefined;
// The server data of a custom field loads on mount and when the document gets its id. Value edits never reload it.
const owner = inject(ownerKey, undefined);
const loader =
  custom?.load && owner
    ? useExtensionData(() => ({
        kind: "field" as const,
        type: customType!,
        path: path.value,
        owner: owner.value,
      }))
    : undefined;

// ponytail: loads every document of the target collection; add search and paging when collections grow.
const options = ref<{ id: string; label: string }[]>([]);
const openRef = inject(openRefKey, undefined);
const optionLabel = (v: string) => options.value.find((o) => o.id === v)?.label ?? v;
if (props.field.type === "relation") {
  const target = props.field.collection;
  client.find(target, { populate: false }).then((docs) => {
    const collection = schema.value.collections?.[target];
    const key = collection ? titleField(collection) : "";
    options.value = docs.map((d) => ({ id: d.id, label: String(d[key] || d.id) }));
  });
}

// A new document's slug follows its `from` field until the editor edits the slug. Saved slugs never change, so URLs stay stable.
const edited = ref(false);
const prefix = ref("/");
const slug = props.field.type === "slug" ? props.field : undefined;
if (slug?.from) {
  const from = slug.from;
  watch(
    () => props.siblings.data[from],
    (text) => {
      if (props.isNew && !edited.value) model.value = slugify(String(text ?? ""));
    },
  );
}
// The prefix is the selected parent's path, e.g. `/about/`.
const relation = slug?.parent ? props.siblings.fields[slug.parent] : undefined;
if (slug?.parent && relation?.type === "relation") {
  const parent = slug.parent;
  watch(
    () => props.siblings.data[parent],
    async (id) => {
      const doc =
        typeof id === "string" && id
          ? await client.findById(relation.collection, id, { populate: false })
          : undefined;
      if (id !== props.siblings.data[parent]) return;
      const value = doc?.[slug.path ?? "path"];
      prefix.value = `${typeof value === "string" ? value.replace(/\/$/, "") : ""}/`;
    },
    { immediate: true },
  );
}
</script>

<template>
  <template v-if="field.type === 'join'" />
  <FieldSet
    v-else-if="field.type === 'group'"
    ref="box"
    :disabled="field.readOnly"
    class="border-border gap-4 rounded-md border p-4"
  >
    <FieldLegend variant="label" class="mb-0 px-1">
      {{ field.label ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </FieldLegend>
    <FieldDescription v-if="field.description" class="-mt-2">{{
      field.description
    }}</FieldDescription>
    <template v-for="(child, key) in field.fields" :key="key">
      <FieldInput
        v-if="active(child, root, model)"
        v-model="model[key]"
        :name="String(key)"
        :field="child"
        :root="root"
        :siblings="{ fields: field.fields, data: model }"
        :is-new="isNew"
        :loose="loose || (!field.required && isEmpty(model))"
        :path="`${path}.${key}`"
        :errors="errors"
        :placeholders="placeholders?.[name] as Record<string, unknown> | undefined"
      />
    </template>
    <FieldError v-if="message">{{ message }}</FieldError>
  </FieldSet>
  <!-- Not a <label>: a click on its list would activate its first button. -->
  <FieldBox
    v-else-if="field.type === 'image' || field.type === 'file'"
    ref="box"
    :data-invalid="invalid"
  >
    <FieldTitle>
      {{ field.label ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </FieldTitle>
    <MediaField v-model="model" :field="field" :invalid="invalid" />
    <FieldDescription v-if="field.description">{{ field.description }}</FieldDescription>
    <FieldError v-if="message">{{ message }}</FieldError>
  </FieldBox>
  <FieldBox
    v-else-if="field.type === 'boolean'"
    ref="box"
    orientation="horizontal"
    :data-invalid="invalid"
  >
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      class="mt-0.5"
      :disabled="field.readOnly"
      :aria-invalid="invalid"
    />
    <FieldContent>
      <FieldLabel :for="id">{{ field.label ?? name }}<SharedMarker v-if="shared" /></FieldLabel>
      <FieldDescription v-if="field.description">{{ field.description }}</FieldDescription>
      <FieldError v-if="message">{{ message }}</FieldError>
    </FieldContent>
  </FieldBox>
  <FieldBox v-else ref="box" :data-invalid="invalid">
    <component :is="custom ? FieldTitle : FieldLabel" :for="custom ? undefined : id">
      {{ field.label ?? name }}
      <span v-if="required" class="text-destructive" aria-hidden="true">*</span>
      <SharedMarker v-if="shared" />
    </component>
    <Mount
      v-if="custom"
      :mount="custom.mount"
      :ctx="{ name, field, value: model, onChange: (v: any) => (model = v) }"
      :loader="loader"
    />
    <textarea
      v-else-if="field.type === 'textarea'"
      :id="id"
      v-model="model"
      class="input min-h-40"
      v-bind="attrs"
      :aria-invalid="invalid"
    />
    <div v-else-if="field.type === 'relation' && field.many" class="flex flex-col gap-2">
      <select
        :id="id"
        v-model="model"
        multiple
        class="input"
        :required="required"
        :disabled="field.readOnly"
        :aria-invalid="invalid"
      >
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <div v-if="openRef && model?.length" class="flex flex-wrap gap-1">
        <Button
          v-for="v in model"
          :key="v"
          type="button"
          variant="outline"
          size="xs"
          @click="openRef(field.collection, v)"
        >
          {{ optionLabel(v) }}<Icon name="arrow-up-right" />
        </Button>
      </div>
    </div>
    <div v-else-if="field.type === 'relation'" class="flex gap-2">
      <select
        :id="id"
        v-model="model"
        class="input flex-1"
        :required="required"
        :disabled="field.readOnly"
        :aria-invalid="invalid"
      >
        <option :value="null" />
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <Button
        v-if="openRef && model"
        type="button"
        variant="outline"
        size="icon"
        aria-label="Open"
        @click="openRef(field.collection, model)"
      >
        <Icon name="arrow-up-right" />
      </Button>
    </div>
    <select
      v-else-if="field.type === 'select'"
      :id="id"
      v-model="model"
      class="input"
      :required="required"
      :disabled="field.readOnly"
      :aria-invalid="invalid"
    >
      <option :value="null" />
      <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <span v-else-if="field.type === 'slug'" class="flex items-center gap-1">
      <span class="text-muted-foreground text-sm">{{ prefix }}</span>
      <input
        :id="id"
        v-model="model"
        class="input"
        v-bind="attrs"
        :pattern="SLUG_PATTERN"
        :aria-invalid="invalid"
        @input="edited = true"
      />
    </span>
    <input
      v-else-if="field.type === 'number'"
      :id="id"
      v-model.number="model"
      type="number"
      class="input"
      v-bind="attrs"
      :aria-invalid="invalid"
    />
    <input
      v-else
      :id="id"
      v-model="model"
      :type="field.type === 'date' ? 'date' : 'text'"
      class="input"
      v-bind="attrs"
      :aria-invalid="invalid"
    />
    <FieldDescription v-if="field.description">{{ field.description }}</FieldDescription>
    <FieldError v-if="message">{{ message }}</FieldError>
  </FieldBox>
</template>
