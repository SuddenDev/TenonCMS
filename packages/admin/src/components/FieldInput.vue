<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { client, type Field, isEmpty, schema, titleField } from '../api'
import { optionsKey } from '../options'
import Mount from './Mount.vue'

// `loose`: the field sits in an optional group that is empty, so `required` does not apply yet.
// `path`: dot path of the field, the key of its message in `errors`. Defaults to `name`.
const props = defineProps<{ name: string; field: Field; loose?: boolean; path?: string; errors?: Record<string, string> }>()
const model = defineModel<any>()
const path = computed(() => props.path ?? props.name)
const message = computed(() => props.errors?.[path.value])
const invalid = computed(() => (message.value ? true : undefined))
const required = computed(() => props.field.required && !props.loose)
// Built-in checks as HTML attributes. Vue drops `undefined` ones, and browsers ignore those an input does not support.
const attrs = computed(() => {
  const f = props.field as Record<string, any>
  return { required: required.value, placeholder: f.placeholder, minlength: f.minLength, maxlength: f.maxLength, pattern: f.pattern, min: f.min, max: f.max }
})
const custom = props.field.type.startsWith('custom:') ? inject(optionsKey, {}).fields?.[props.field.type.slice(7)] : undefined

// ponytail: loads every document of the target collection; add search and paging when collections grow.
const options = ref<{ id: string; label: string }[]>([])
if (props.field.type === 'relation') {
  const target = props.field.collection
  client.find(target, { populate: false }).then((docs) => {
    const collection = schema.value.collections?.[target]
    const key = collection ? titleField(collection) : ''
    options.value = docs.map((d) => ({ id: d.id, label: String(d[key] || d.id) }))
  })
}
</script>

<template>
  <template v-if="field.type === 'join'" />
  <fieldset v-else-if="field.type === 'group'" class="flex flex-col gap-4 rounded border border-gray-200 p-4">
    <legend class="px-1 text-sm font-medium">
      {{ field.label ?? name }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </legend>
    <small v-if="field.description" class="-mt-2 text-xs text-zinc-500">{{ field.description }}</small>
    <FieldInput
      v-for="(child, key) in field.fields"
      :key="key"
      v-model="model[key]"
      :name="String(key)"
      :field="child"
      :loose="loose || (!field.required && isEmpty(model))"
      :path="`${path}.${key}`"
      :errors="errors"
    />
    <span v-if="message" class="text-xs text-red-600" role="alert">{{ message }}</span>
  </fieldset>
  <label v-else-if="field.type === 'boolean'" class="flex flex-wrap items-center gap-2 text-sm">
    <input v-model="model" type="checkbox" :aria-invalid="invalid" />
    {{ field.label ?? name }}
    <small v-if="field.description" class="basis-full text-xs text-zinc-500">{{ field.description }}</small>
    <span v-if="message" class="basis-full text-xs text-red-600" role="alert">{{ message }}</span>
  </label>
  <label v-else class="flex flex-col gap-1 text-sm">
    <span>
      {{ field.label ?? name }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </span>
    <Mount v-if="custom" :mount="custom" :ctx="{ name, field, value: model, onChange: (v: any) => (model = v) }" />
    <textarea v-else-if="field.type === 'textarea'" v-model="model" class="input min-h-40" v-bind="attrs" :aria-invalid="invalid" />
    <select v-else-if="field.type === 'relation' && field.many" v-model="model" multiple class="input" :required="required" :aria-invalid="invalid">
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
    </select>
    <select v-else-if="field.type === 'relation'" v-model="model" class="input" :required="required" :aria-invalid="invalid">
      <option :value="null" />
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
    </select>
    <select v-else-if="field.type === 'select'" v-model="model" class="input" :required="required" :aria-invalid="invalid">
      <option :value="null" />
      <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <input v-else-if="field.type === 'number'" v-model.number="model" type="number" class="input" v-bind="attrs" :aria-invalid="invalid" />
    <input v-else v-model="model" :type="field.type === 'date' ? 'date' : 'text'" class="input" v-bind="attrs" :aria-invalid="invalid" />
    <small v-if="field.description" class="text-xs text-zinc-500">{{ field.description }}</small>
    <span v-if="message" class="text-xs text-red-600" role="alert">{{ message }}</span>
  </label>
</template>
