<script setup lang="ts">
import { inject } from 'vue'
import type { Field } from '../api'
import { optionsKey } from '../options'
import Mount from './Mount.vue'

const props = defineProps<{ name: string; field: Field }>()
const model = defineModel<any>()
const custom = props.field.type.startsWith('custom:') ? inject(optionsKey, {}).fields?.[props.field.type.slice(7)] : undefined
</script>

<template>
  <label v-if="field.type === 'boolean'" class="flex items-center gap-2 text-sm">
    <input v-model="model" type="checkbox" />
    {{ field.label ?? name }}
  </label>
  <label v-else class="flex flex-col gap-1 text-sm">
    <span>
      {{ field.label ?? name }}
      <span v-if="field.required" class="text-red-600" aria-hidden="true">*</span>
    </span>
    <Mount v-if="custom" :mount="custom" :ctx="{ name, field, value: model, onChange: (v: any) => (model = v) }" />
    <textarea v-else-if="field.type === 'textarea'" v-model="model" class="input min-h-40" :required="field.required" />
    <select v-else-if="field.type === 'select'" v-model="model" class="input" :required="field.required">
      <option :value="null" />
      <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
    </select>
    <input
      v-else-if="field.type === 'number'"
      v-model.number="model"
      type="number"
      class="input"
      :required="field.required"
    />
    <input v-else v-model="model" :type="field.type === 'date' ? 'date' : 'text'" class="input" :required="field.required" />
  </label>
</template>
