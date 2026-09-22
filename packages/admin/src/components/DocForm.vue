<script setup lang="ts">
import { ref } from 'vue'
import type { Fields } from '../api'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ fields: Fields; initial: Record<string, unknown>; save: (data: Record<string, unknown>) => Promise<void> }>()

const data = ref(Object.fromEntries(Object.entries(props.fields).map(([k, f]) => [k, props.initial[k] ?? (f.type === 'boolean' ? false : null)])))
const error = ref('')
const saved = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    // Empty strings become null, so cleared optional fields pass validation.
    await props.save(Object.fromEntries(Object.entries(data.value).map(([k, v]) => [k, v === '' ? null : v])))
    saved.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="flex max-w-2xl flex-col gap-4" @submit.prevent="submit">
    <FieldInput v-for="(field, name) in fields" :key="name" v-model="data[name]" :name="String(name)" :field="field" />
    <div class="flex items-center gap-3">
      <button class="btn" :disabled="busy">Save</button>
      <slot />
      <span v-if="saved" class="text-sm text-green-700" role="status">Saved</span>
      <span v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</span>
    </div>
  </form>
</template>
