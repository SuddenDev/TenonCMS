import { ref } from 'vue'
import { createClient } from '../../core/src/client'
import type { Collection, Schema } from '../../core/src/schema'

export type { Data, Field, Fields } from '../../core/src/schema'

export const client = createClient<{ schema: Schema }>()

export const schema = ref<Schema>({})

/** Field shown as a document's title in lists and page titles. */
export function titleField(collection: Collection) {
  return collection.titleField ?? Object.keys(collection.fields).find((k) => !['group', 'join'].includes(collection.fields[k].type)) ?? ''
}

/** A group value is empty when every value is null, '', false, [] or an empty group. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return true
  return typeof value === 'object' && Object.values(value).every(isEmpty)
}
