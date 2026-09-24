<script setup lang="ts">
import { ref } from 'vue'
import { type Data, type Fields, isEmpty } from '../api'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ fields: Fields; initial: Record<string, unknown>; save: (data: Data<Fields>) => Promise<void> }>()

// Groups always render as objects, so their inputs have a model to bind to.
// On save, an optional group with only empty values becomes null, so its required children do not apply.
// Empty strings become null, so cleared optional fields pass validation.
// Joins are not stored, so they stay out of the form data.
function normalize(fields: Fields, value: Record<string, any> | null | undefined, save = false): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([k, f]) => {
      if (f.type === 'join') return []
      const v = value?.[k]
      if (f.type === 'group') {
        const g = normalize(f.fields, v, save)
        return [[k, save && !f.required && isEmpty(g) ? null : g]]
      }
      if (f.type === 'boolean') return [[k, v ?? false]]
      if (f.type === 'relation' && f.many) return [[k, v ?? []]]
      return [[k, v === '' || v === undefined ? null : v]]
    }),
  )
}

const data = ref(normalize(props.fields, props.initial))
const error = ref('')
const saved = ref(false)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    // Fields can change after mount, so the payload follows the current fields.
    await props.save(normalize(props.fields, data.value, true) as Data<Fields>)
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
