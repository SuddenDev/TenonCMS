import type { Config, Data, Doc } from './schema.ts'

/** Path of the HTTP API. */
export const API_BASE = '/api/cms'

type Collections<C extends { config: Config }> = NonNullable<C['config']['collections']>
type Globals<C extends { config: Config }> = NonNullable<C['config']['globals']>
type Fields<C extends { config: Config }, K extends keyof Collections<C>> = Collections<C>[K]['fields']

/**
 * Holds the host's `cms` type, so `createClient()` is typed without a type argument.
 * The Astro and Nuxt adapters fill it in. Elsewhere, map `#integral/config` to your config file and
 * load `integral-cms/register` in `tsconfig.json`:
 * @example
 * "paths": { "#integral/config": ["./integral.config.ts"] },
 * "types": ["integral-cms/register"]
 */
export interface Register {}

/** The registered `cms` type, or an untyped config without a registration. */
export type RegisteredCms = Register extends { cms: infer C extends { config: Config } } ? C : { config: Config }

export type ClientOptions = {
  /** Origin of the host app, e.g. `https://example.com`. Defaults to the current origin. */
  baseUrl?: string
  /** Custom `fetch`, e.g. one that forwards cookies. Defaults to the global `fetch`. */
  fetch?: typeof fetch
}

/** The signed-in admin, as returned by `getSession()`. Dates are ISO strings. */
export type Session = {
  user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null; createdAt: string; updatedAt: string }
  session: { id: string; userId: string; expiresAt: string; createdAt: string; updatedAt: string }
}

/** Thrown by client methods when the API answers with a non-2xx status. */
export class CmsError extends Error {
  constructor(
    /** HTTP status, e.g. `401` without a session or `400` for invalid data. */
    public status: number,
    /** Parsed response body, if any. */
    public body: any,
  ) {
    super(body?.message ?? body?.error?.[0]?.message ?? `Request failed (${status})`)
  }
}

/**
 * Typed HTTP client for `/api/cms`. It has the same methods as the local API, so code reads the same on
 * both sides. Use it in the browser: admin pages, islands, client components. On the server, call the
 * `cms` instance directly.
 *
 * Reads are public. Writes need an admin session cookie, so they work in admin pages.
 *
 * Collection and global names and document types come from the registered `cms`. See {@link Register}.
 * Pass a type argument to override it.
 * @example
 * import { createClient } from 'integral-cms/client'
 *
 * const client = createClient()
 * const posts = await client.find('posts', { where: { featured: true } })
 */
export function createClient<C extends { config: Config } = RegisteredCms>({ baseUrl = '', fetch: fetchFn = fetch }: ClientOptions = {}) {
  async function request<T>(method: string, path: string, body?: unknown, query?: object): Promise<T> {
    const search = query && Object.keys(query).length ? `?${new URLSearchParams(query as Record<string, string>)}` : ''
    const res = await fetchFn(`${baseUrl}${API_BASE}${path}${search}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) throw new CmsError(res.status, data)
    return data as T
  }
  const doc = (collection: string, id: string) => `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`

  const client = {
    /**
     * Lists documents of a collection, newest first.
     * `GET /api/cms/collections/:collection`
     */
    find<K extends keyof Collections<C> & string>(
      collection: K,
      options: {
        /** Equality filters on field values. */
        where?: Partial<Record<keyof Fields<C, K>, string | number | boolean>>
        /** Maximum number of documents. */
        limit?: number
      } = {},
    ) {
      const query = { ...options.where, ...(options.limit && { limit: options.limit }) }
      return request<Doc<Fields<C, K>>[]>('GET', `/collections/${encodeURIComponent(collection)}`, undefined, query)
    },

    /** Returns the newest document that matches `where`, or `undefined`. */
    async findOne<K extends keyof Collections<C> & string>(
      collection: K,
      options: {
        /** Equality filters on field values. */
        where: Partial<Record<keyof Fields<C, K>, string | number | boolean>>
      },
    ): Promise<Doc<Fields<C, K>> | undefined> {
      return (await client.find(collection, { ...options, limit: 1 }))[0]
    },

    /**
     * Returns one document. Throws a `CmsError` with status `404` if it does not exist.
     * `GET /api/cms/collections/:collection/:id`
     */
    findById<K extends keyof Collections<C> & string>(collection: K, id: string) {
      return request<Doc<Fields<C, K>>>('GET', doc(collection, id))
    },

    /**
     * Creates a document. Needs a session.
     * `POST /api/cms/collections/:collection`
     */
    create<K extends keyof Collections<C> & string>(collection: K, data: Data<Fields<C, K>>) {
      return request<Doc<Fields<C, K>>>('POST', `/collections/${encodeURIComponent(collection)}`, data)
    },

    /**
     * Replaces the data of a document. Fields left out are cleared. Needs a session.
     * `PUT /api/cms/collections/:collection/:id`
     */
    update<K extends keyof Collections<C> & string>(collection: K, id: string, data: Data<Fields<C, K>>) {
      return request<Doc<Fields<C, K>>>('PUT', doc(collection, id), data)
    },

    /**
     * Deletes a document. Needs a session.
     * `DELETE /api/cms/collections/:collection/:id`
     */
    delete(collection: keyof Collections<C> & string, id: string) {
      return request<null>('DELETE', doc(collection, id))
    },

    /**
     * Returns a global. Fields that were never saved are missing.
     * `GET /api/cms/globals/:name`
     */
    getGlobal<K extends keyof Globals<C> & string>(name: K) {
      return request<Partial<Data<Globals<C>[K]['fields']>>>('GET', `/globals/${encodeURIComponent(name)}`)
    },

    /**
     * Replaces the data of a global. Needs a session.
     * `PUT /api/cms/globals/:name`
     */
    setGlobal<K extends keyof Globals<C> & string>(name: K, data: Data<Globals<C>[K]['fields']>) {
      return request<Data<Globals<C>[K]['fields']>>('PUT', `/globals/${encodeURIComponent(name)}`, data)
    },

    /**
     * Returns the collections and globals with their fields. Needs a session.
     * `GET /api/cms/schema`
     */
    getSchema() {
      return request<C['config']>('GET', '/schema')
    },

    /**
     * Creates the first admin and signs them in. Throws a `CmsError` with status `403` once an admin exists.
     * `POST /api/cms/auth/sign-up/email`
     */
    async signUp(data: { name: string; email: string; password: string }) {
      return (await request<{ user: Session['user'] }>('POST', '/auth/sign-up/email', data)).user
    },

    /**
     * Signs in and sets the session cookie. Throws a `CmsError` with status `401` for a wrong email or password.
     * `POST /api/cms/auth/sign-in/email`
     */
    async signIn(data: { email: string; password: string }) {
      return (await request<{ user: Session['user'] }>('POST', '/auth/sign-in/email', data)).user
    },

    /**
     * Signs out and clears the session cookie.
     * `POST /api/cms/auth/sign-out`
     */
    async signOut() {
      await request('POST', '/auth/sign-out', {})
    },

    /**
     * Returns the signed-in admin, or `null` without a session.
     * `GET /api/cms/auth/get-session`
     * @example
     * const { user } = (await client.getSession()) ?? {}
     * user?.name
     */
    getSession() {
      return request<Session | null>('GET', '/auth/get-session')
    },
  }
  return client
}

export type Client<C extends { config: Config } = RegisteredCms> = ReturnType<typeof createClient<C>>
