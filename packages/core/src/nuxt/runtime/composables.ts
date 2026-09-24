import { useAsyncData, useRequestEvent } from '#app'
import type cms from '#integral/config'
import { createClient } from 'integral-cms/client'

type Collections = NonNullable<(typeof cms)['schema']['collections']>
type Globals = NonNullable<(typeof cms)['schema']['globals']>

// The client's read methods for pages. During SSR the request stays in-process; on client-side
// navigation it hits the public read API.
export function useIntegral() {
  const event = useRequestEvent()
  const client = createClient<typeof cms>({ fetch: event && ((input, init) => event.fetch(String(input), init)) })
  return {
    find<K extends keyof Collections & string>(collection: K, options: Parameters<typeof client.find<K>>[1] = {}) {
      return useAsyncData(`integral:${collection}:${JSON.stringify(options)}`, () => client.find(collection, options))
    },
    findOne<K extends keyof Collections & string>(collection: K, options: Parameters<typeof client.findOne<K>>[1]) {
      return useAsyncData(`integral:${collection}:one:${JSON.stringify(options.where)}`, async () => (await client.findOne(collection, options)) ?? null)
    },
    findById<K extends keyof Collections & string>(collection: K, id: string) {
      return useAsyncData(`integral:${collection}:${id}`, () => client.findById(collection, id))
    },
    getGlobal<K extends keyof Globals & string>(name: K) {
      return useAsyncData(`integral:global:${name}`, () => client.getGlobal(name))
    },
  }
}
