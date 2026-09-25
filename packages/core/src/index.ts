import type { User } from 'better-auth'
import { consola } from 'consola'
import { type Kysely, sql } from 'kysely'
import { createApp } from './app.ts'
import { type AuthOptions, authOptions, createAuth } from './auth.ts'
import { createDb, type Database, migrate, toDoc } from './db/index.ts'
import { checkRefs, checkSchema, populate, remove, type Spec } from './relations.ts'
import {
  type Checked,
  type CheckRefs,
  type Collection,
  type Data,
  dataSchema,
  type Doc,
  type FieldHooks,
  type Fields,
  type FilterKey,
  filterable,
  type Global,
  type LocalApi,
  type Operation,
  parseData,
  type PopulateOf,
  type Read,
  type ReadDoc,
  type ReadOptions,
  type Schema,
  type Slot,
} from './schema.ts'

export { defineCollection, defineGlobal } from './schema.ts'
export type { Collection, Schema, Data, Doc, Field, Fields, Global } from './schema.ts'

export type { AuthOptions } from './auth.ts'
export { ConflictError, type Reference, ValidationError } from './errors.ts'

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
  // The plain `Record` gives inline hooks a contextual type. Without it, their arguments are implicit `any`.
  collections?: C & NoInfer<CheckRefs<C, C> & Record<string, Collection>>
  globals?: G & NoInfer<CheckRefs<G, C> & Record<string, Global>>
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
  type T = { collections?: C; globals?: G }
  type D = DefaultDepth<P>
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 }
  checkSchema(schema, defaults)
  const collections: Record<string, Collection> = schema.collections ?? {}
  const globals: Record<string, Global> = schema.globals ?? {}
  const validators = {
    collections: mapValues(collections, (c) => dataSchema(c.fields)),
    globals: mapValues(globals, (g) => dataSchema(g.fields)),
  }
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

  const q = async (s: Scope) => s.trx ?? (await db())
  const common = (s: Inner, name: Name) => ({ cms: s.cms, user: s.user, context: s.context, ...name })

  // Every local API call goes through here. Collection calls run `beforeOperation` and `afterOperation`.
  // Writes run in one transaction with their hooks and nested calls. Reads open none.
  async function run<R>(scope: Scope, operation: Operation, name: Name, args: Record<string, any>, fn: (s: Inner, args: Record<string, any>) => Promise<R>) {
    const context = scope.nested ? scope.context : {}
    const body = async (trx = scope.trx) => {
      const s: Scope = { ...scope, trx, context, nested: true }
      const inner: Inner = { ...s, cms: bind(s) as unknown as LocalApi }
      const h = name.collection ? collections[name.collection].hooks : undefined
      const base = { ...common(inner, name), operation }
      const input = await hooks(h?.beforeOperation, 'args', args, base)
      return (await hooks(h?.afterOperation, 'result', await fn(inner, input), { ...base, args: input })) as R
    }
    if (operation === 'read' || operation === 'getGlobal' || scope.trx) return body()
    return (await db()).transaction().execute((trx) => body(trx))
  }

  // Shared by `create` and `update`. Returns `undefined` for a missing document.
  async function write(s: Inner, collection: string, operation: 'create' | 'update', input: unknown, id?: string) {
    const { fields, hooks: h } = collections[collection]
    const originalDoc = id ? await load(s, collection, id) : undefined
    if (id && !originalDoc) return undefined
    const base = { ...common(s, { collection }), operation, id, originalDoc }
    const fieldArgs = (data: object) => ({ ...common(s, { collection }), operation, data, originalDoc })
    const validate = (data: unknown) => parseData(validators.collections[collection], data)
    const copy = structuredClone(input)
    if (typeof copy === 'object' && copy !== null) await fieldHooks('beforeValidate', fields, copy, fieldArgs(copy))
    const valid = validate(await hooks(h?.beforeValidate, 'data', copy, base))
    await fieldHooks('beforeChange', fields, valid, fieldArgs(valid))
    // Validated again, so a hook cannot store invalid data.
    const data = validate(await hooks(h?.beforeChange, 'data', valid, base))
    const db = await q(s)
    await checkRefs(db, fields, data, id ? { collection, id } : undefined)
    const now = Date.now()
    const json = JSON.stringify(data)
    const row = id
      ? await db
          .updateTable('cms_documents')
          .set({ data: json, updated_at: now })
          .where('collection', '=', collection)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await db
          .insertInto('cms_documents')
          .values({ id: crypto.randomUUID(), collection, data: json, created_at: now, updated_at: now })
          .returningAll()
          .executeTakeFirstOrThrow()
    const stored = toDoc(row)
    await fieldHooks('afterChange', fields, stored, fieldArgs(stored))
    const doc = await hooks(h?.afterChange, 'doc', stored, { ...common(s, { collection }), operation, previousDoc: originalDoc })
    return (await afterRead(s, collection, [doc], operation))[0]
  }

  // Field `afterRead` per document, then the collection's once for the batch.
  async function afterRead(s: Inner, collection: string, docs: Record<string, any>[], operation: Operation) {
    const { fields, hooks: h } = collections[collection]
    for (const doc of docs) await fieldHooks('afterRead', fields, doc, { ...common(s, { collection }), operation, data: doc })
    return hooks(h?.afterRead, 'docs', docs, { ...common(s, { collection }), operation })
  }

  // `find`, `findOne` and `findById`: `beforeRead`, then relations, then `afterRead`.
  async function read(s: Inner, collection: string, options: ReadOpts) {
    const { fields, hooks: h } = collections[collection]
    let query = (await q(s)).selectFrom('cms_documents').selectAll().where('collection', '=', collection)
    if (options.id !== undefined) query = query.where('id', '=', options.id)
    for (const [key, value] of Object.entries(options.where ?? {})) {
      if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`)
      if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`)
      if (value === undefined) continue
      const field = sql`json_extract(data, ${`$.${key}`})`
      query = query.where(value === null ? sql<boolean>`${field} IS NULL` : sql<boolean>`${field} = ${value}`)
    }
    // `rowid` orders documents created in the same millisecond.
    query = query.orderBy('created_at', 'desc').orderBy(sql`rowid`, 'desc')
    if (options.limit) query = query.limit(options.limit)
    const base = { ...common(s, { collection }), operation: 'read' as const }
    const docs = await hooks(h?.beforeRead, 'docs', (await query.execute()).map(toDoc), base)
    await populate(await q(s), collections, fields, docs, spec(options))
    return afterRead(s, collection, docs, 'read')
  }

  // One stored document without relations resolved, or `undefined`.
  async function load(s: Scope, collection: string, id: string) {
    const row = await (await q(s)).selectFrom('cms_documents').selectAll().where('collection', '=', collection).where('id', '=', id).executeTakeFirst()
    return row && toDoc(row)
  }

  function bind(scope: Scope) {
    const api = {
      /**
       * Lists documents of a collection, newest first.
       * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
       */
      async find<K extends keyof Collections<T> & string, const O extends FindOptions<T, K> = {}>(
        collection: K,
        options: Checked<O, Collections<T>, Collections<T>[K]['fields']> = {} as never,
      ): Promise<ReadCollection<T, K, O, D>[]> {
        if (!Object.hasOwn(collections, collection)) throw new Error(`Unknown collection "${collection}"`)
        return run(scope, 'read', { collection }, { collection, options }, (s, args) => read(s, collection, args.options)) as Promise<ReadCollection<T, K, O, D>[]>
      },

      /**
       * Returns the newest document that matches `where`, or `undefined`.
       * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
       */
      async findOne<K extends keyof Collections<T> & string, const O extends FindOptions<T, K>>(
        collection: K,
        options: Checked<O, Collections<T>, Collections<T>[K]['fields']>,
      ): Promise<ReadCollection<T, K, O, D> | undefined> {
        if (!Object.hasOwn(collections, collection)) throw new Error(`Unknown collection "${collection}"`)
        return run(scope, 'read', { collection }, { collection, options }, async (s, args) => (await read(s, collection, { ...args.options, limit: 1 }))[0]) as Promise<ReadCollection<T, K, O, D> | undefined>
      },

      /** Returns one document, or `undefined`. */
      async findById<K extends keyof Collections<T> & string, const O extends ReadOptions<Collections<T>, Collections<T>[K]['fields']> = {}>(
        collection: K,
        id: string,
        options: Checked<O, Collections<T>, Collections<T>[K]['fields']> = {} as never,
      ): Promise<ReadCollection<T, K, O, D> | undefined> {
        if (!Object.hasOwn(collections, collection)) return undefined
        return run(scope, 'read', { collection }, { collection, id, options }, async (s, args) => (await read(s, collection, { ...args.options, id: args.id }))[0]) as Promise<ReadCollection<T, K, O, D> | undefined>
      },

      /** Creates a document. Throws a `ValidationError` for invalid `data`. */
      async create<K extends keyof Collections<T> & string>(collection: K, data: Record<string, unknown>) {
        if (!Object.hasOwn(collections, collection)) throw new Error(`Unknown collection "${collection}"`)
        return (await run(scope, 'create', { collection }, { collection, data }, (s, args) =>
          write(s, collection, 'create', args.data),
        )) as CollectionDoc<T, K>
      },

      /** Replaces the data of a document. Returns `undefined` if it does not exist. Throws a `ValidationError` for invalid `data`. */
      async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
        if (!Object.hasOwn(collections, collection)) return undefined
        return (await run(scope, 'update', { collection }, { collection, id, data }, (s, args) =>
          write(s, collection, 'update', args.data, args.id),
        )) as CollectionDoc<T, K> | undefined
      },

      /** Deletes a document and applies `onDelete` to every reference to it, in one transaction. */
      async delete(collection: keyof Collections<T> & string, id: string) {
        if (!Object.hasOwn(collections, collection)) return
        await run(scope, 'delete', { collection }, { collection, id }, async (s, args) => {
          const h = collections[collection].hooks
          const doc = await load(s, collection, args.id)
          if (!doc) return
          const base = { ...common(s, { collection }), id: args.id, doc }
          await hooks(h?.beforeDelete, 'doc', doc, base)
          await remove(s.trx!, schema, collection, args.id, new Set())
          await hooks(h?.afterDelete, 'doc', doc, base)
        })
      },

      /** Returns a global. Fields that were never saved are missing. */
      async getGlobal<K extends keyof Globals<T> & string, const O extends ReadOptions<Collections<T>, Globals<T>[K]['fields']> = {}>(
        name: K,
        options: Checked<O, Collections<T>, Globals<T>[K]['fields']> = {} as never,
      ): Promise<ReadGlobal<T, K, O, D>> {
        const db = await q(scope)
        const row = await db.selectFrom('cms_globals').select('data').where('name', '=', name).executeTakeFirst()
        const data = row ? JSON.parse(row.data) : {}
        await populate(db, collections, schema.globals![name].fields, [data], spec(options))
        return data as ReadGlobal<T, K, O, D>
      },

      /** Replaces the data of a global. Throws a `ValidationError` for invalid `data`. */
      async setGlobal<K extends keyof Globals<T> & string>(name: K, input: Record<string, unknown>) {
        if (!Object.hasOwn(globals, name)) throw new Error(`Unknown global "${name}"`)
        const data = parseData(validators.globals[name], input)
        const db = await q(scope)
        await checkRefs(db, schema.globals![name].fields, data)
        const now = Date.now()
        const json = JSON.stringify(data)
        await db
          .insertInto('cms_globals')
          .values({ name, data: json, created_at: now, updated_at: now })
          .onConflict((oc) => oc.column('name').doUpdateSet({ data: json, updated_at: now }))
          .execute()
        return data as GlobalData<T, K>
      },

    }
    return api
  }

  const cms = {
    schema: schema as T,
    auth,
    /** The `populate` config with defaults. */
    populate: defaults as { depth: D; maxDepth: number },
    ...bind({ user: null, context: {}, nested: false }),

    /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>
    },
  }

  const app = createApp(cms as unknown as Cms<Schema>)
  return cms
}

type Name = { collection?: string; global?: string }
type ReadOpts = { where?: Record<string, unknown>; limit?: number; populate?: boolean | object; depth?: number; id?: string }

/** One call of the local API. Calls from inside a hook share `trx`, `user` and `context`. */
type Scope = {
  trx?: Kysely<Database>
  user: User | null
  context: Record<string, unknown>
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean
}
type Inner = Scope & { cms: LocalApi }

const list = <F>(slot?: F[] | Record<string, F>) => (Array.isArray(slot) ? slot : Object.values(slot ?? {}))

// A hook MAY return a replacement for the main value. `undefined` keeps it.
async function hooks<V>(slot: Slot<any> | undefined, key: string, value: V, args: object): Promise<V> {
  for (const fn of list(slot)) {
    const result = await fn({ ...args, [key]: value })
    if (result !== undefined) value = result
  }
  return value
}

// In field order and depth-first into groups. A group's own hooks run before its fields'.
async function fieldHooks(stage: keyof FieldHooks<unknown>, fields: Fields, siblingData: Record<string, any>, args: object, prefix = '') {
  for (const [key, field] of Object.entries(fields)) {
    const path = prefix + key
    if (field.type !== 'join' && field.hooks?.[stage]) {
      const value = await hooks(field.hooks[stage], 'value', siblingData[key], { ...args, siblingData, path })
      if (value !== undefined) siblingData[key] = value
    }
    const group = siblingData[key]
    if (field.type === 'group' && typeof group === 'object' && group !== null) await fieldHooks(stage, field.fields, group, args, `${path}.`)
  }
}

function mapValues<T, R>(record: Record<string, T>, fn: (value: T) => R) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]))
}

export type Cms<T extends Schema> = ReturnType<typeof defineCms<NonNullable<T['collections']>, NonNullable<T['globals']>>>
