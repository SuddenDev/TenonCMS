import { and, desc, eq, sql } from 'drizzle-orm'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { createDb, migrate, schema } from './db/index.ts'
import type { Config, Data, Doc } from './schema.ts'

export { defineConfig } from './schema.ts'
export type { Collection, Config, Data, Doc, Field, Fields, Global } from './schema.ts'

export type CmsOptions<T extends Config> = {
  config: T
  database: { url: string; authToken?: string }
  // Secret for signing sessions. MUST be at least 32 random characters in production.
  secret: string
}

type Collections<T extends Config> = NonNullable<T['collections']>
type Globals<T extends Config> = NonNullable<T['globals']>
type CollectionDoc<T extends Config, K extends keyof Collections<T>> = Doc<Collections<T>[K]['fields']>
type GlobalData<T extends Config, K extends keyof Globals<T>> = Data<Globals<T>[K]['fields']>
type FindOptions<T extends Config, K extends keyof Collections<T>> = {
  // Equality filters on field values.
  where?: Partial<Record<keyof Collections<T>[K]['fields'], string | number | boolean>>
}

type Row = typeof schema.documents.$inferSelect

function toDoc(row: Row) {
  return {
    ...row.data,
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function createCms<const T extends Config>({ config, database, secret }: CmsOptions<T>) {
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

  const { documents, globals } = schema

  const cms = {
    config,
    auth,

    async find<K extends keyof Collections<T> & string>(
      collection: K,
      options: FindOptions<T, K> = {},
    ): Promise<CollectionDoc<T, K>[]> {
      const filters = Object.entries(options.where ?? {}).map(([key, value]) => {
        if (!Object.hasOwn(config.collections![collection].fields, key)) throw new Error(`Unknown field "${key}"`)
        return sql`json_extract(${documents.data}, ${`$.${key}`}) = ${value}`
      })
      const rows = await (await db())
        .select()
        .from(documents)
        .where(and(eq(documents.collection, collection), ...filters))
        .orderBy(desc(documents.createdAt))
      return rows.map(toDoc) as CollectionDoc<T, K>[]
    },

    async findOne<K extends keyof Collections<T> & string>(
      collection: K,
      options: FindOptions<T, K>,
    ): Promise<CollectionDoc<T, K> | undefined> {
      return (await cms.find(collection, options))[0]
    },

    async findById<K extends keyof Collections<T> & string>(collection: K, id: string) {
      const [row] = await (await db())
        .select()
        .from(documents)
        .where(and(eq(documents.collection, collection), eq(documents.id, id)))
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    async create<K extends keyof Collections<T> & string>(collection: K, data: Record<string, unknown>) {
      const [row] = await (await db())
        .insert(documents)
        .values({ id: crypto.randomUUID(), collection, data })
        .returning()
      return toDoc(row) as CollectionDoc<T, K>
    },

    async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
      const [row] = await (await db())
        .update(documents)
        .set({ data, updatedAt: new Date() })
        .where(and(eq(documents.collection, collection), eq(documents.id, id)))
        .returning()
      return row && (toDoc(row) as CollectionDoc<T, K>)
    },

    async delete(collection: keyof Collections<T> & string, id: string) {
      await (await db()).delete(documents).where(and(eq(documents.collection, collection), eq(documents.id, id)))
    },

    async getGlobal<K extends keyof Globals<T> & string>(name: K): Promise<Partial<GlobalData<T, K>>> {
      const [row] = await (await db()).select().from(globals).where(eq(globals.name, name))
      return (row?.data ?? {}) as Partial<GlobalData<T, K>>
    },

    async setGlobal<K extends keyof Globals<T> & string>(name: K, data: Record<string, unknown>) {
      await (await db())
        .insert(globals)
        .values({ name, data })
        .onConflictDoUpdate({ target: globals.name, set: { data, updatedAt: new Date() } })
      return data as GlobalData<T, K>
    },

    // Handles /admin and /api/cms requests. Mount it in any framework that speaks Request/Response.
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>
    },
  }

  const app = createApp(cms as unknown as Cms<Config>)
  return cms
}

export type Cms<T extends Config> = ReturnType<typeof createCms<T>>
