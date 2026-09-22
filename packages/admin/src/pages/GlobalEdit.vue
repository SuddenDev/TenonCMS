<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, schema } from '../api'
import DocForm from '../components/DocForm.vue'

const name = useRoute().params.name as string
const global = computed(() => schema.value.globals?.[name])
const data = ref<Record<string, unknown> | null>(null)

api(`/globals/${name}`).then((d) => (data.value = d))

async function save(body: Record<string, unknown>) {
  data.value = await api(`/globals/${name}`, { method: 'PUT', body })
}
</script>

<template>
  <template v-if="global && data">
    <h1 class="mb-6 text-2xl font-semibold">{{ global.label ?? name }}</h1>
    <DocForm :fields="global.fields" :initial="data" :save="save" />
  </template>
</template>
