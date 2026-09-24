import { consola } from 'consola'
import { type Selectable, sql } from 'kysely'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { createDb, createDrizzle, type Database, migrate, migrateDrizzle } from './db/index.ts'
import type { Collection, Data, Doc, Global, Schema } from './schema.ts'

export { defineCollection, defineGlobal } from './schema.ts'
export type { Collection, Schema, Data, Doc, Field, Fields, Global } from './schema.ts'

export type CmsOptions<C extends Record<string, Collection>, G extends Record<string, Global>> = {
  collections?: C
  globals?: G
  database: { url: string; authToken?: string }
  /** Secret for signing sessions. MUST be at least 32 random characters in production. */
  secret: string
}

type Collections<T extends Schema> = NonNullable<T['collections']>
type Globals<T extends Schema> = NonNullable<T['globals']>
type CollectionDoc<T extends Schema, K extends keyof Collections<T>> = Doc<Collections<T>[K]['fields']>
type GlobalData<T extends Schema, K extends keyof Globals<T>> = Data<Globals<T>[K]['fields']>
type FindOptions<T extends Schema, K extends keyof Collections<T>> = {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<keyof Collections<T>[K]['fields'], string | number | boolean | null>>
  /** Maximum number of documents. */
  limit?: number
}

type Row = Selectable<Database['cms_documents']>

function toDoc(row: Row) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/**
 * Creates a CMS instance. Export it as the default export of `integral.config.ts`.
 *
 * The returned object is the local API for server code. Nothing connects until the first call.
 */
export function defineCms<const C extends Record<string, Collection> = {}, const G extends Record<string, Global> = {}>({
  database,
  secret,
  ...schema
}: CmsOptions<C, G>) {
  type T = typeof schema
  const count = (o?: object) => Object.keys(o ?? {}).length
  consola.withTag('integral').info(`Initialized with ${count(schema.collections)} collection(s), ${count(schema.globals)} global(s)`)
  // Created lazily so no connection opens at import time.
  let ready: Promise<{ db: ReturnType<typeof createDb>; drizzle: ReturnType<typeof createDrizzle> }> | undefined
  const connect = () =>
    (ready ??= (async () => {
      const drizzle = createDrizzle(database.url, database.authToken)
      await migrateDrizzle(drizzle)
      const db = createDb(database.url, database.authToken)
      await migrate(db)
      return { db, drizzle }
    })())
  const db = async () => (await connect()).db

  let authInstance: ReturnType<typeof createAuth> | undefined
  const auth = async () => {
    if (!secret || secret.length < 32) throw new Error('integral-cms: `secret` MUST be at least 32 characters')
    return (authInstance ??= createAuth((await connect()).drizzle, secret))
  }

  const cms = {
    schema,
    auth,

    /**
     * Lists documents of a collection, newest first.
     * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
     */
    async find<K extends keyof Collections<T> & string>(
      collection: K,
      options: FindOptions<T, K> = {},
    ): Promise<CollectionDoc<T, K>[]> {
      let query = (await db()).selectFrom('cms_documents').selectAll().where('collection', '=', collection)
      for (const [key, value] of Object.entries(options.where ?? {})) {
        if (!Object.hasOwn(schema.collections![collection].fields, key)) throw new Error(`Unknown field "${key}"`)
        if (value === undefined) continue
        const field = sql`json_extract(data, ${`$.${key}`})`
        query = query.where(value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`)
      }
      // `rowid` orders documents created in the same millisecond.
      query = query.orderBy('created_at', 'desc').orderBy(sql`rowid`, 'desc')
      if (options.limit) query = query.limit(options.limit)
      return (await query.execute()).map(toDoc) as CollectionDoc<T, K>[]
    },

    /**
     * Returns the newest document that matches `where`, or `undefined`.
     * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
     */
    async findOne<K extends keyof Collections<T> & string>(
      collection: K,
      options: FindOptions<T, K>,
    ): Promise<CollectionDoc<T, K> | undefined> {
      return (await cms.find(collection, { ...options, limit: 1 }))[0]
    },

    /** Returns one document, or `undefined`. */
    async findById<K extends keyof Collections<T> & string>(collection: K, id: string) {
      const row = await (await db())
        .selectFrom('cms_documents')
        .selectAll()
        .where('collection', '=', collection)
        .where('id', '=', id)
        .executeTakeFirst()
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    /** Creates a document. Does not validate `data`. */
    async create<K extends keyof Collections<T> & string>(collection: K, data: Record<string, unknown>) {
      const now = Date.now()
      const row = await (await db())
        .insertInto('cms_documents')
        .values({ id: crypto.randomUUID(), collection, data: JSON.stringify(data), created_at: now, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow()
      return toDoc(row) as CollectionDoc<T, K>
    },

    /** Replaces the data of a document. Returns `undefined` if it does not exist. Does not validate `data`. */
    async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
      const row = await (await db())
        .updateTable('cms_documents')
        .set({ data: JSON.stringify(data), updated_at: Date.now() })
        .where('collection', '=', collection)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst()
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    /** Deletes a document. */
    async delete(collection: keyof Collections<T> & string, id: string) {
      await (await db()).deleteFrom('cms_documents').where('collection', '=', collection).where('id', '=', id).execute()
    },

    /** Returns a global. Fields that were never saved are missing. */
    async getGlobal<K extends keyof Globals<T> & string>(name: K): Promise<Partial<GlobalData<T, K>>> {
      const row = await (await db()).selectFrom('cms_globals').select('data').where('name', '=', name).executeTakeFirst()
      return (row ? JSON.parse(row.data) : {}) as Partial<GlobalData<T, K>>
    },

    /** Replaces the data of a global. Does not validate `data`. */
    async setGlobal<K extends keyof Globals<T> & string>(name: K, data: Record<string, unknown>) {
      const now = Date.now()
      const json = JSON.stringify(data)
      await (await db())
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
