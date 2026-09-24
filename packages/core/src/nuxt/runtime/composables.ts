import { useAsyncData, useRequestEvent } from '#app'
import type cms from '#integral/config'
import { type Checked, createClient, type FindOptions } from 'integral-cms/client'

type Collections = NonNullable<(typeof cms)['schema']['collections']>
type Globals = NonNullable<(typeof cms)['schema']['globals']>
type Fields<K extends keyof Collections> = Collections[K]['fields']

// The client's read methods for pages. During SSR the request stays in-process; on client-side
// navigation it hits the public read API.
export function useIntegral() {
  const event = useRequestEvent()
  const client = createClient<typeof cms>({ fetch: event && ((input, init) => event.fetch(String(input), init)) })
  return {
    find<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K> = {}>(
      collection: K,
      options: Checked<O, Collections, Fields<K>> = {} as never,
    ) {
      return useAsyncData(`integral:${collection}:${JSON.stringify(options)}`, () => client.find<K, O>(collection, options))
    },
    findOne<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K>>(
      collection: K,
      options: Checked<O, Collections, Fields<K>>,
    ) {
      return useAsyncData(`integral:${collection}:one:${JSON.stringify(options.where)}`, async () => (await client.findOne<K, O>(collection, options)) ?? null)
    },
    findById<K extends keyof Collections & string>(collection: K, id: string) {
      return useAsyncData(`integral:${collection}:${id}`, () => client.findById(collection, id))
    },
    getGlobal<K extends keyof Globals & string>(name: K) {
      return useAsyncData(`integral:global:${name}`, () => client.getGlobal(name))
    },
  }
}
