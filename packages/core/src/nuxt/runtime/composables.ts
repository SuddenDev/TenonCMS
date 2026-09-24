import { useAsyncData, useRequestEvent } from '#app'
import type cms from '#integral/config'
import { type Checked, createClient, type FindOptions, type ReadOptions } from 'integral-cms/client'

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
      return useAsyncData(`integral:${collection}:one:${JSON.stringify(options)}`, async () => (await client.findOne<K, O>(collection, options)) ?? null)
    },
    findById<K extends keyof Collections & string, const O extends ReadOptions<Collections, Fields<K>> = {}>(
      collection: K,
      id: string,
      options: Checked<O, Collections, Fields<K>> = {} as never,
    ) {
      return useAsyncData(`integral:${collection}:${id}:${JSON.stringify(options)}`, () => client.findById<K, O>(collection, id, options))
    },
    getGlobal<K extends keyof Globals & string, const O extends ReadOptions<Collections, Globals[K]['fields']> = {}>(
      name: K,
      options: Checked<O, Collections, Globals[K]['fields']> = {} as never,
    ) {
      return useAsyncData(`integral:global:${name}:${JSON.stringify(options)}`, () => client.getGlobal<K, O>(name, options))
    },
  }
}
