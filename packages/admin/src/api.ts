import { ref } from 'vue'
import { createClient } from '../../core/src/client'
import type { Config } from '../../core/src/schema'

export type { Config, Data, Field, Fields } from '../../core/src/schema'

export const client = createClient<{ config: Config }>()

export const schema = ref<Config>({})
