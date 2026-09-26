import { useAsyncData, useRequestEvent } from '#app'
import type cms from '#integral/config'
import { type Checked, type Collections as HttpCollections, createClient, type FindOptions, type Globals as HttpGlobals, type ReadOptions } from 'integral-cms/client'

// The client's types, so the options check the same way. The collection methods cast `options` when they pass it on:
// TypeScript cannot match the two generic `select` checks, and the composable's own parameter already checks it.
type Collections = HttpCollections<typeof cms>
type Globals = HttpGlobals<typeof cms>
type Fields<K extends keyof Collections> = Collections[K]['fields']
type Depth = (typeof cms)['populate']['depth']

// The client's read methods for pages. During SSR the request stays in-process; on client-side
// navigation it hits the public read API.
export function useIntegral() {
  const event = useRequestEvent()
  const client = createClient<typeof cms>({ fetch: event && ((input, init) => event.fetch(String(input), init)) })
  return {
    find<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K> = {}>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth> = {} as never,
    ) {
      return useAsyncData(`integral:${collection}:${JSON.stringify(options)}`, () => client.find<K, O>(collection, options as never))
    },
    findOne<K extends keyof Collections & string, const O extends FindOptions<typeof cms, K>>(
      collection: K,
      options: Checked<O, Collections, Fields<K>, Depth>,
    ) {
      return useAsyncData(`integral:${collection}:one:${JSON.stringify(options)}`, async () => (await client.findOne<K, O>(collection, options as never)) ?? null)
    },
    findById<K extends keyof Collections & string, const O extends ReadOptions<Collections, Fields<K>> = {}>(
      collection: K,
      id: string,
      options: Checked<O, Collections, Fields<K>, Depth> = {} as never,
    ) {
      return useAsyncData(`integral:${collection}:${id}:${JSON.stringify(options)}`, () => client.findById<K, O>(collection, id, options as never))
    },
    getGlobal<K extends keyof Globals & string, const O extends ReadOptions<Collections, Globals[K]['fields']> = {}>(
      name: K,
      options: Checked<O, Collections, Globals[K]['fields'], Depth> = {} as never,
    ) {
      return useAsyncData(`integral:global:${name}:${JSON.stringify(options)}`, () => client.getGlobal<K, O>(name, options))
    },
  }
}
