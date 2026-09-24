import { consola } from 'consola'
import { sql } from 'kysely'
import { createApp } from './app.ts'
import { type AuthOptions, authOptions, createAuth } from './auth.ts'
import { createDb, migrate, toDoc } from './db/index.ts'
import { checkRefs, checkSchema, populate, remove, type Spec } from './relations.ts'
import {
  type Checked,
  type CheckRefs,
  type Collection,
  type Data,
  type Doc,
  type FilterKey,
  filterable,
  type Global,
  type PopulateOf,
  type Read,
  type ReadDoc,
  type ReadOptions,
  type Schema,
} from './schema.ts'

export { defineCollection, defineGlobal } from './schema.ts'
export type { Collection, Schema, Data, Doc, Field, Fields, Global } from './schema.ts'

export type { AuthOptions } from './auth.ts'
export { ConflictError, type Reference } from './errors.ts'

export type PopulateConfig = {
  /** Hops resolved by `populate: true`. Default 2. */
  depth?: number
  /** Limit for HTTP requests. Default 5. The local API has no limit. */
  maxDepth?: number
}
type DefaultDepth<P extends PopulateConfig> = P['depth'] extends number ? P['depth'] : 2

export type CmsOptions<
  C extends Record<string, Collection>,
  G extends Record<string, Global>,
  A extends AuthOptions = {},
  P extends PopulateConfig = {},
> = {
  collections?: C & NoInfer<CheckRefs<C, C>>
  globals?: G & NoInfer<CheckRefs<G, C>>
  /** Defaults for reads that resolve relations. */
  populate?: P
  database: { url: string; authToken?: string }
  /** Secret for signing sessions. MUST be at least 32 random characters in production. */
  secret: string
  // `& AuthOptions` types hook parameters. Inference alone leaves them `any`.
  /** better-auth options. Core owns `database`, `basePath` and `secret`. */
  auth?: A & AuthOptions
}

type Collections<T extends Schema> = NonNullable<T['collections']>
type Globals<T extends Schema> = NonNullable<T['globals']>
type CollectionDoc<T extends Schema, K extends keyof Collections<T>> = Doc<Collections<T>[K]['fields']>
type GlobalData<T extends Schema, K extends keyof Globals<T>> = Data<Globals<T>[K]['fields']>
type FindOptions<T extends Schema, K extends keyof Collections<T>> = ReadOptions<Collections<T>, Collections<T>[K]['fields']> & {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<FilterKey<Collections<T>[K]['fields']>, string | number | boolean | null>>
  /** Maximum number of documents. */
  limit?: number
}
type ReadCollection<T extends Schema, K extends keyof Collections<T>, O, D extends number> = ReadDoc<
  Collections<T>,
  Collections<T>[K]['fields'],
  PopulateOf<O, D>
>
type ReadGlobal<T extends Schema, K extends keyof Globals<T>, O, D extends number> = Partial<
  Read<Collections<T>, Globals<T>[K]['fields'], PopulateOf<O, D>>
>


/**
 * Creates a CMS instance. Export it as the default export of `integral.config.ts`.
 *
 * The returned object is the local API for server code. Nothing connects until the first call.
 */
export function defineCms<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
  const A extends AuthOptions = {},
  const P extends PopulateConfig = {},
>({ database, secret, auth: host = {} as A, populate: config = {} as P, ...schema }: CmsOptions<C, G, A, P>) {
  type T = typeof schema
  type D = DefaultDepth<P>
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 }
  checkSchema(schema, defaults)
  const collections: Record<string, Collection> = schema.collections ?? {}
  const spec = (options: { populate?: boolean | object; depth?: number }): Spec =>
    options.populate === false ? false : typeof options.populate === 'object' ? (options.populate as Spec) : (options.depth ?? defaults.depth)
  const count = (o?: object) => Object.keys(o ?? {}).length
  consola.withTag('integral').info(`Initialized with ${count(schema.collections)} collection(s), ${count(schema.globals)} global(s)`)
  // Created lazily so no connection opens at import time.
  let ready: Promise<{ db: ReturnType<typeof createDb>; options: ReturnType<typeof authOptions<A>> }> | undefined
  const connect = () =>
    (ready ??= (async () => {
      const db = createDb(database.url, database.authToken)
      const options = authOptions(db, secret, host)
      await migrate(db, options)
      return { db, options }
    })())
  const db = async () => (await connect()).db

  let authInstance: ReturnType<typeof createAuth<ReturnType<typeof authOptions<A>>>> | undefined
  const auth = async () => {
    if (!secret || secret.length < 32) throw new Error('integral-cms: `secret` MUST be at least 32 characters')
    return (authInstance ??= createAuth((await connect()).options))
  }

  const cms = {
    schema,
    auth,
    /** The `populate` config with defaults. */
    populate: defaults as { depth: D; maxDepth: number },

    /**
     * Lists documents of a collection, newest first.
     * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
     */
    async find<K extends keyof Collections<T> & string, const O extends FindOptions<T, K> = {}>(
      collection: K,
      options: Checked<O, Collections<T>, Collections<T>[K]['fields']> = {} as never,
    ): Promise<ReadCollection<T, K, O, D>[]> {
      let query = (await db()).selectFrom('cms_documents').selectAll().where('collection', '=', collection)
      for (const [key, value] of Object.entries(options.where ?? {})) {
        const fields = schema.collections![collection].fields
        if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`)
        if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`)
        if (value === undefined) continue
        const field = sql`json_extract(data, ${`$.${key}`})`
        query = query.where(value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`)
      }
      // `rowid` orders documents created in the same millisecond.
      query = query.orderBy('created_at', 'desc').orderBy(sql`rowid`, 'desc')
      if (options.limit) query = query.limit(options.limit)
      const docs = (await query.execute()).map(toDoc)
      await populate(await db(), collections, collections[collection].fields, docs, spec(options))
      return docs as ReadCollection<T, K, O, D>[]
    },

    /**
     * Returns the newest document that matches `where`, or `undefined`.
     * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
     */
    async findOne<K extends keyof Collections<T> & string, const O extends FindOptions<T, K>>(
      collection: K,
      options: Checked<O, Collections<T>, Collections<T>[K]['fields']>,
    ): Promise<ReadCollection<T, K, O, D> | undefined> {
      return (await cms.find(collection, { ...options, limit: 1 } as never))[0] as ReadCollection<T, K, O, D> | undefined
    },

    /** Returns one document, or `undefined`. */
    async findById<K extends keyof Collections<T> & string, const O extends ReadOptions<Collections<T>, Collections<T>[K]['fields']> = {}>(
      collection: K,
      id: string,
      options: Checked<O, Collections<T>, Collections<T>[K]['fields']> = {} as never,
    ): Promise<ReadCollection<T, K, O, D> | undefined> {
      const row = await (await db())
        .selectFrom('cms_documents')
        .selectAll()
        .where('collection', '=', collection)
        .where('id', '=', id)
        .executeTakeFirst()
      if (!row) return undefined
      const doc = toDoc(row)
      await populate(await db(), collections, collections[collection].fields, [doc], spec(options))
      return doc as ReadCollection<T, K, O, D>
    },

    /** Creates a document. Checks relation ids, but does not validate the rest of `data`. */
    async create<K extends keyof Collections<T> & string>(collection: K, data: Record<string, unknown>) {
      const q = await db()
      await checkRefs(q, schema.collections![collection].fields, data)
      const now = Date.now()
      const row = await q
        .insertInto('cms_documents')
        .values({ id: crypto.randomUUID(), collection, data: JSON.stringify(data), created_at: now, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow()
      return toDoc(row) as CollectionDoc<T, K>
    },

    /** Replaces the data of a document. Returns `undefined` if it does not exist. Checks relation ids, but does not validate the rest of `data`. */
    async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
      const q = await db()
      await checkRefs(q, schema.collections![collection]?.fields ?? {}, data, { collection, id })
      const row = await q
        .updateTable('cms_documents')
        .set({ data: JSON.stringify(data), updated_at: Date.now() })
        .where('collection', '=', collection)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst()
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    /** Deletes a document and applies `onDelete` to every reference to it, in one transaction. */
    async delete(collection: keyof Collections<T> & string, id: string) {
      await (await db()).transaction().execute((trx) => remove(trx, schema, collection, id, new Set()))
    },

    /** Returns a global. Fields that were never saved are missing. */
    async getGlobal<K extends keyof Globals<T> & string, const O extends ReadOptions<Collections<T>, Globals<T>[K]['fields']> = {}>(
      name: K,
      options: Checked<O, Collections<T>, Globals<T>[K]['fields']> = {} as never,
    ): Promise<ReadGlobal<T, K, O, D>> {
      const q = await db()
      const row = await q.selectFrom('cms_globals').select('data').where('name', '=', name).executeTakeFirst()
      const data = row ? JSON.parse(row.data) : {}
      await populate(q, collections, schema.globals![name].fields, [data], spec(options))
      return data as ReadGlobal<T, K, O, D>
    },

    /** Replaces the data of a global. Checks relation ids, but does not validate the rest of `data`. */
    async setGlobal<K extends keyof Globals<T> & string>(name: K, data: Record<string, unknown>) {
      const q = await db()
      await checkRefs(q, schema.globals![name].fields, data)
      const now = Date.now()
      const json = JSON.stringify(data)
      await q
        .insertInto('cms_globals')
        .values({ name, data: json, created_at: now, updated_at: now })
        .onConflict((oc) => oc.column('name').doUpdateSet({ data: json, updated_at: now }))
        .execute()
      return data as GlobalData<T, K>
    },

    /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>
    },
  }

  const app = createApp(cms as unknown as Cms<Schema>)
  return cms
}

export type Cms<T extends Schema> = ReturnType<typeof defineCms<NonNullable<T['collections']>, NonNullable<T['globals']>>>
