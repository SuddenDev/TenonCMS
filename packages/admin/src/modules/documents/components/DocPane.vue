<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, provide, ref } from "vue";
import { useRouter } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import { openRefKey, reloadKey, titleField } from "@/modules/documents/fields";
import DocForm from "@/modules/documents/components/DocForm.vue";
import { Pane, Icon } from "@/shared";
import { Button } from "@/shared/components/ui/button";

// `closable`: a reference pane. It shows a close button and leaves the page title alone.
// `open`: opens a reference of this pane to its right.
const props = defineProps<{
  name: string;
  id: string;
  closable?: boolean;
  open?: (collection: string, id: string) => void;
}>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const doc = ref<Record<string, unknown> | null>(null);

const router = useRouter();
const reload = inject(reloadKey, () => {});
if (props.open) provide(openRefKey, props.open);
const isNew = props.id === "new";
const collection = computed(() => schema.value.collections?.[props.name]);
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
  isNew
    ? `New ${collection.value?.label ?? props.name}`
    : String((collection.value && doc.value?.[titleField(collection.value)]) || "Untitled");

if (!props.closable) useHead({ title });

if (isNew) doc.value = {};
else {
  client.findById(props.name, props.id, { populate: false }).then((d) => (doc.value = d));
  if (joins.value.length) {
    const populate = Object.fromEntries(joins.value.map((j) => [j.key, true]));
    client.findById(props.name, props.id, { populate }).then((d) => (joined.value = d));
  }
}

async function save(data: Data<Fields>) {
  if (isNew) {
    const created = await client.create(props.name, data);
    reload();
    await router.replace(`/collections/${props.name}/${created.id}`);
  } else {
    doc.value = await client.update(props.name, props.id, data);
    reload();
  }
}

async function remove() {
  if (!confirm("Delete this entry?")) return;
  error.value = "";
  try {
    await client.delete(props.name, props.id);
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  reload();
  emit("deleted");
}
</script>

<template>
  <Pane v-if="collection" :title="title()" :min="448" grow :collapsible="false">
    <template #actions>
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
        class="flex-1"
        :fields="collection.fields"
        :initial="doc"
        :save="save"
        :is-new="isNew"
      >
        <Button v-if="!isNew" type="button" variant="ghost" size="sm" @click="remove">
          Delete
        </Button>
        <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
      </DocForm>
    </div>
  </Pane>
</template>
