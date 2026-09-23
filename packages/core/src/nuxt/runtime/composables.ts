import { useAsyncData, useRequestFetch } from '#app'
import type { cms } from '#integral/config'
import type { Data, Doc } from 'integral-cms'

type Cms = typeof cms
type Collections = NonNullable<Cms['config']['collections']>
type Globals = NonNullable<Cms['config']['globals']>
type CollectionDoc<K extends keyof Collections> = Doc<Collections[K]['fields']>
type Where<K extends keyof Collections> = Partial<Record<keyof Collections[K]['fields'], string | number | boolean>>

const base = '/api/cms'

// Mirrors the local API for pages. During SSR the request stays in-process; on client-side
// navigation it hits the public read API.
export function useIntegral() {
  const fetch = useRequestFetch()
  return {
    find<K extends keyof Collections & string>(collection: K, options: { where?: Where<K> } = {}) {
      return useAsyncData(`integral:${collection}:${JSON.stringify(options.where ?? {})}`, () =>
        fetch<CollectionDoc<K>[]>(`${base}/collections/${collection}`, { query: options.where }),
      )
    },
    findOne<K extends keyof Collections & string>(collection: K, options: { where: Where<K> }) {
      return useAsyncData(`integral:${collection}:one:${JSON.stringify(options.where)}`, async () => {
        const docs = await fetch<CollectionDoc<K>[]>(`${base}/collections/${collection}`, { query: options.where })
        return docs[0] ?? null
      })
    },
    findById<K extends keyof Collections & string>(collection: K, id: string) {
      return useAsyncData(`integral:${collection}:${id}`, () =>
        fetch<CollectionDoc<K>>(`${base}/collections/${collection}/${id}`),
      )
    },
    getGlobal<K extends keyof Globals & string>(name: K) {
      return useAsyncData(`integral:global:${name}`, () =>
        fetch<Partial<Data<Globals[K]['fields']>>>(`${base}/globals/${name}`),
      )
    },
  }
}
