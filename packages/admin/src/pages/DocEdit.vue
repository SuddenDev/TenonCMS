<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { client, schema, type Data, type Fields } from '../api'
import DocForm from '../components/DocForm.vue'

const route = useRoute()
const router = useRouter()
const name = route.params.name as string
const id = route.params.id as string
const isNew = id === 'new'
const collection = computed(() => schema.value.collections?.[name])
const doc = ref<Record<string, unknown> | null>(isNew ? {} : null)

if (!isNew) client.findById(name, id).then((d) => (doc.value = d))

async function save(data: Data<Fields>) {
  if (isNew) {
    const created = await client.create(name, data)
    await router.replace(`/collections/${name}/${created.id}`)
  } else {
    doc.value = await client.update(name, id, data)
  }
}

async function remove() {
  if (!confirm('Delete this entry?')) return
  await client.delete(name, id)
  await router.push(`/collections/${name}`)
}
</script>

<template>
  <template v-if="collection && doc">
    <RouterLink :to="`/collections/${name}`" class="text-sm text-zinc-500">← {{ collection.label ?? name }}</RouterLink>
    <h1 class="mb-6 mt-1 text-2xl font-semibold">{{ isNew ? 'New entry' : 'Edit entry' }}</h1>
    <DocForm :fields="collection.fields" :initial="doc" :save="save">
      <button v-if="!isNew" type="button" class="btn-ghost text-red-600" @click="remove">Delete</button>
    </DocForm>
  </template>
</template>
