import { consola } from 'consola'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { createDb, migrate, schema as tables } from './db/index.ts'
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

type Row = typeof tables.documents.$inferSelect

function toDoc(row: Row) {
  return {
    ...row.data,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
  let ready: Promise<ReturnType<typeof createDb>> | undefined
  const db = () =>
    (ready ??= (async () => {
      const db = createDb(database.url, database.authToken)
      await migrate(db)
      return db
    })())

  let authInstance: ReturnType<typeof createAuth> | undefined
  const auth = async () => {
    if (!secret || secret.length < 32) throw new Error('integral-cms: `secret` MUST be at least 32 characters')
    return (authInstance ??= createAuth(await db(), secret))
  }

  const { documents, globals } = tables

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
      const filters = Object.entries(options.where ?? {}).map(([key, value]) => {
        if (!Object.hasOwn(schema.collections![collection].fields, key)) throw new Error(`Unknown field "${key}"`)
        if (value === undefined) return undefined
        const field = sql`json_extract(${documents.data}, ${`$.${key}`})`
        return value === null ? sql`${field} IS NULL` : sql`${field} = ${value}`
      })
      const query = (await db())
        .select()
        .from(documents)
        .where(and(eq(documents.collection, collection), ...filters))
        // `rowid` orders documents created in the same millisecond.
        .orderBy(desc(documents.createdAt), desc(sql`rowid`))
      const rows = await (options.limit ? query.limit(options.limit) : query)
      return rows.map(toDoc) as CollectionDoc<T, K>[]
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
      const [row] = await (await db())
        .select()
        .from(documents)
        .where(and(eq(documents.collection, collection), eq(documents.id, id)))
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    /** Creates a document. Does not validate `data`. */
    async create<K extends keyof Collections<T> & string>(collection: K, data: Record<string, unknown>) {
      const [row] = await (await db())
        .insert(documents)
        .values({ id: crypto.randomUUID(), collection, data })
        .returning()
      return toDoc(row) as CollectionDoc<T, K>
    },

    /** Replaces the data of a document. Returns `undefined` if it does not exist. Does not validate `data`. */
    async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
      const [row] = await (await db())
        .update(documents)
        .set({ data, updatedAt: new Date() })
        .where(and(eq(documents.collection, collection), eq(documents.id, id)))
        .returning()
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    /** Deletes a document. */
    async delete(collection: keyof Collections<T> & string, id: string) {
      await (await db()).delete(documents).where(and(eq(documents.collection, collection), eq(documents.id, id)))
    },

    /** Returns a global. Fields that were never saved are missing. */
    async getGlobal<K extends keyof Globals<T> & string>(name: K): Promise<Partial<GlobalData<T, K>>> {
      const [row] = await (await db()).select().from(globals).where(eq(globals.name, name))
      return (row?.data ?? {}) as Partial<GlobalData<T, K>>
    },

    /** Replaces the data of a global. Does not validate `data`. */
    async setGlobal<K extends keyof Globals<T> & string>(name: K, data: Record<string, unknown>) {
      await (await db())
        .insert(globals)
        .values({ name, data })
        .onConflictDoUpdate({ target: globals.name, set: { data, updatedAt: new Date() } })
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
