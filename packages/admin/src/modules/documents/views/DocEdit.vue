<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import { titleField } from "@/modules/documents/fields";
import DocForm from "@/modules/documents/components/DocForm.vue";
import FormHeader from "@/modules/documents/components/FormHeader.vue";
import { Button } from "@/shared/components/ui/button";
import { useBreadcrumb } from "@/shared/composables/useBreadcrumbs";

const route = useRoute();
const router = useRouter();
const name = route.params.name as string;
const id = route.params.id as string;
const isNew = id === "new";
const collection = computed(() => schema.value.collections?.[name]);
const doc = ref<Record<string, unknown> | null>(isNew ? {} : null);
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
    ? "New"
    : String((collection.value && doc.value?.[titleField(collection.value)]) || "Untitled");

useHead({ title: () => (isNew ? `New · ${collection.value?.label ?? name}` : title()) });
useBreadcrumb(title);

if (!isNew) {
  client.findById(name, id, { populate: false }).then((d) => (doc.value = d));
  if (joins.value.length) {
    const populate = Object.fromEntries(joins.value.map((j) => [j.key, true]));
    client.findById(name, id, { populate }).then((d) => (joined.value = d));
  }
}

async function save(data: Data<Fields>) {
  if (isNew) {
    const created = await client.create(name, data);
    await router.replace(`/collections/${name}/${created.id}`);
  } else {
    doc.value = await client.update(name, id, data);
  }
}

async function remove() {
  if (!confirm("Delete this entry?")) return;
  error.value = "";
  try {
    await client.delete(name, id);
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  await router.push(`/collections/${name}`);
}
</script>

<template>
  <template v-if="collection && doc">
    <FormHeader
      :to="`/collections/${name}`"
      :title="isNew ? 'New entry' : 'Edit entry'"
      :description="collection.description"
    >
      <Button type="submit" form="doc-form">Save</Button>
    </FormHeader>
    <DocForm id="doc-form" :fields="collection.fields" :initial="doc" :save="save" :is-new="isNew">
      <Button v-if="!isNew" type="button" variant="destructive" @click="remove">Delete</Button>
      <span v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</span>
    </DocForm>
    <template v-if="!isNew">
      <section v-for="j in joins" :key="j.key" class="mt-8 max-w-2xl">
        <h2 class="mb-2 text-sm font-medium">{{ j.field.label ?? j.key }}</h2>
        <ul class="divide-border border-border bg-card divide-y rounded-lg border">
          <li v-for="d in joined[j.key] ?? []" :key="d.id">
            <RouterLink
              :to="`/collections/${j.field.collection}/${d.id}`"
              class="hover:bg-muted block px-4 py-3 text-sm"
            >
              {{ label(j.field.collection, d) }}
            </RouterLink>
          </li>
          <li v-if="!joined[j.key]?.length" class="text-muted-foreground px-4 py-3 text-sm">
            Nothing linked.
          </li>
        </ul>
      </section>
    </template>
  </template>
</template>
