import { ref } from 'vue'
import { createClient } from '../../core/src/client'
import type { Collection, Config } from '../../core/src/schema'

export type { Data, Field, Fields } from '../../core/src/schema'

export const client = createClient<{ config: Config }>()

export const schema = ref<Config>({})

/** Field shown as a document's title in lists and page titles. */
export function titleField(collection: Collection) {
  return collection.titleField ?? Object.keys(collection.fields)[0]
}
