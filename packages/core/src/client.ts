import type { Checked, Data, Doc, Fields as FieldsOf, FilterKey, PopulateOf, Read, ReadDoc, ReadOptions, Schema } from './schema.ts'

export type { Checked, ReadOptions } from './schema.ts'

/** Path of the HTTP API. */
export const API_BASE = '/api/cms'

// Fields as the HTTP API sends them: private fields optional.
// Untyped fields (the admin's) stay as they are. The recursion would not terminate.
type HttpFields<F> = string extends keyof F ? F : { [K in keyof F]: HttpField<F[K]> }
type HttpField<F> = F extends { private: true } ? Omit<HttpGroup<F>, 'required'> : HttpGroup<F>
type HttpGroup<F> = F extends { type: 'group'; fields: infer G } ? Omit<F, 'fields'> & { fields: Extract<HttpFields<G>, FieldsOf> } : F
// `Extract` keeps the result assignable to `Fields`.
type Http<R> = string extends keyof R ? R : { [K in keyof R]: Omit<R[K], 'fields'> & { fields: R[K] extends { fields: infer F } ? Extract<HttpFields<F>, FieldsOf> : never } }
type Collections<C extends { schema: Schema }> = Http<NonNullable<C['schema']['collections']>>
type Globals<C extends { schema: Schema }> = Http<NonNullable<C['schema']['globals']>>
type Fields<C extends { schema: Schema }, K extends keyof Collections<C>> = Collections<C>[K]['fields']
type Depth<C> = C extends { populate: { depth: infer D extends number } } ? D : 2
type ReadCollection<C extends { schema: Schema }, K extends keyof Collections<C>, O> = ReadDoc<
  Collections<C>,
  Fields<C, K>,
  PopulateOf<O, Depth<C>>
>
/** Options of `find` and `findOne` for collection `K`. */
export type FindOptions<C extends { schema: Schema }, K extends keyof Collections<C>> = ReadOptions<Collections<C>, Fields<C, K>> & {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<FilterKey<Fields<C, K>>, string | number | boolean | null>>
  /** Maximum number of documents. */
  limit?: number
}

// `{ author: { avatar: true } }` becomes `author.avatar`. An empty object ends a path too.
function paths(populate: object, prefix = ''): string[] {
  return Object.entries(populate).flatMap(([key, value]) =>
    value === true || (value && typeof value === 'object' && !Object.keys(value).length)
      ? [prefix + key]
      : value && typeof value === 'object'
        ? paths(value, `${prefix}${key}.`)
        : [],
  )
}
function readQuery(options: { populate?: boolean | object; depth?: number }) {
  const { populate, depth } = options
  return { populate: populate === false ? 'false' : typeof populate === 'object' ? paths(populate).join(',') || 'false' : undefined, depth }
}

/**
 * Holds the host's `cms` type, so `createClient()` is typed without a type argument.
 * The Astro and Nuxt adapters fill it in. Elsewhere, map `#integral/config` to your config file and
 * load `integral-cms/register` in `tsconfig.json`:
 * @example
 * "paths": { "#integral/config": ["./integral.config.ts"] },
 * "types": ["integral-cms/register"]
 */
export interface Register {}

/** The registered `cms` type, or an untyped schema without a registration. */
export type RegisteredCms = Register extends { cms: infer C extends { schema: Schema } } ? C : { schema: Schema }

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
    /**
     * Parsed response body, if any. It has `message`. A `400` for invalid data also has `errors`: messages by field path.
     * A `409` for a blocked delete has `references`: the documents that point to it.
     */
    public body: any,
  ) {
    super(body?.message ?? `Request failed (${status})`)
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
export function createClient<C extends { schema: Schema } = RegisteredCms>({ baseUrl = '', fetch: fetchFn = fetch }: ClientOptions = {}) {
  async function request<T>(method: string, path: string, body?: unknown, query?: object): Promise<T> {
    const params = new URLSearchParams(
      Object.entries(query ?? {}).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
    )
    const search = params.size ? `?${params}` : ''
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
    find<K extends keyof Collections<C> & string, const O extends FindOptions<C, K> = {}>(
      collection: K,
      options: Checked<O, Collections<C>, Fields<C, K>> = {} as never,
    ) {
      const query = { ...options.where, ...(options.limit && { limit: options.limit }), ...readQuery(options) }
      return request<ReadCollection<C, K, O>[]>('GET', `/collections/${encodeURIComponent(collection)}`, undefined, query)
    },

    /** Returns the newest document that matches `where`, or `undefined`. */
    async findOne<K extends keyof Collections<C> & string, const O extends FindOptions<C, K>>(
      collection: K,
      options: Checked<O, Collections<C>, Fields<C, K>>,
    ): Promise<ReadCollection<C, K, O> | undefined> {
      return (await client.find(collection, { ...options, limit: 1 } as never))[0] as ReadCollection<C, K, O> | undefined
    },

    /**
     * Returns one document. Throws a `CmsError` with status `404` if it does not exist.
     * `GET /api/cms/collections/:collection/:id`
     */
    findById<K extends keyof Collections<C> & string, const O extends ReadOptions<Collections<C>, Fields<C, K>> = {}>(
      collection: K,
      id: string,
      options: Checked<O, Collections<C>, Fields<C, K>> = {} as never,
    ) {
      return request<ReadCollection<C, K, O>>('GET', doc(collection, id), undefined, readQuery(options))
    },

    /**
     * Creates a document. Needs a session.
     * `POST /api/cms/collections/:collection`
     */
    create<K extends keyof Collections<C> & string>(collection: K, data: Data<Fields<C, K>>) {
      return request<Doc<Fields<C, K>>>('POST', `/collections/${encodeURIComponent(collection)}`, data)
    },

    /**
     * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
     * `PUT /api/cms/collections/:collection/:id`
     */
    update<K extends keyof Collections<C> & string>(collection: K, id: string, data: Partial<Data<Fields<C, K>>>) {
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
    getGlobal<K extends keyof Globals<C> & string, const O extends ReadOptions<Collections<C>, Globals<C>[K]['fields']> = {}>(
      name: K,
      options: Checked<O, Collections<C>, Globals<C>[K]['fields']> = {} as never,
    ) {
      return request<Partial<Read<Collections<C>, Globals<C>[K]['fields'], PopulateOf<O, Depth<C>>>>>(
        'GET',
        `/globals/${encodeURIComponent(name)}`,
        undefined,
        readQuery(options),
      )
    },

    /**
     * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Needs a session.
     * `PUT /api/cms/globals/:name`
     */
    setGlobal<K extends keyof Globals<C> & string>(name: K, data: Partial<Data<Globals<C>[K]['fields']>>) {
      return request<Data<Globals<C>[K]['fields']>>('PUT', `/globals/${encodeURIComponent(name)}`, data)
    },

    /**
     * Returns the collections and globals with their fields. Needs a session.
     * `GET /api/cms/schema`
     */
    getSchema() {
      return request<{ collections?: Collections<C>; globals?: Globals<C> }>('GET', '/schema')
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

export type Client<C extends { schema: Schema } = RegisteredCms> = ReturnType<typeof createClient<C>>
