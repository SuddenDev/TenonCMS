<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { client, schema, titleField, type Data, type Fields } from "../api";
import DocForm from "../components/DocForm.vue";

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

useHead({
  title: () =>
    isNew
      ? `New · ${collection.value?.label ?? name}`
      : String((collection.value && doc.value?.[titleField(collection.value)]) || "Untitled"),
});

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
    <RouterLink :to="`/collections/${name}`" class="text-sm text-zinc-500"
      >← {{ collection.label ?? name }}</RouterLink
    >
    <h1 class="mt-1 mb-6 text-2xl font-semibold">{{ isNew ? "New entry" : "Edit entry" }}</h1>
    <DocForm :fields="collection.fields" :initial="doc" :save="save" :is-new="isNew">
      <button v-if="!isNew" type="button" class="btn-ghost text-red-600" @click="remove">
        Delete
      </button>
      <span v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</span>
    </DocForm>
    <template v-if="!isNew">
      <section v-for="j in joins" :key="j.key" class="mt-8 max-w-2xl">
        <h2 class="mb-2 text-sm font-medium">{{ j.field.label ?? j.key }}</h2>
        <ul class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          <li v-for="d in joined[j.key] ?? []" :key="d.id">
            <RouterLink
              :to="`/collections/${j.field.collection}/${d.id}`"
              class="block px-4 py-3 text-sm hover:bg-zinc-50"
            >
              {{ label(j.field.collection, d) }}
            </RouterLink>
          </li>
          <li v-if="!joined[j.key]?.length" class="px-4 py-3 text-sm text-zinc-500">
            Nothing linked.
          </li>
        </ul>
      </section>
    </template>
  </template>
</template>
