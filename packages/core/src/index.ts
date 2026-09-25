import type { User } from 'better-auth'
import { consola } from 'consola'
import { type Kysely, sql } from 'kysely'
import { createApp } from './app.ts'
import { type AuthOptions, authOptions, createAuth } from './auth.ts'
import { isObject, matchCondition } from './condition.ts'
import { createDb, type Database, migrate, toDoc } from './db/index.ts'
import { ConflictError, ValidationError } from './errors.ts'
import { checkRefs, checkSchema, onDelete, populate, type ReadHooks, type Spec } from './relations.ts'
import {
  type Checked,
  checkFields,
  type CheckRefs,
  type Collection,
  type Data,
  dataSchema,
  type Doc,
  type FieldArgs,
  type FieldHooks,
  type Fields,
  type FilterKey,
  filterable,
  type Global,
  type HookArgs,
  type LocalApi,
  type Operation,
  parseData,
  type PopulateOf,
  type Read,
  type ReadDoc,
  type ReadOptions,
  type RootHooks,
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
  /** Hooks for every collection and global. */
  hooks?: RootHooks
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
>({ database, secret, auth: host = {} as A, populate: config = {} as P, hooks: rootHooks = {}, ...schema }: CmsOptions<C, G, A, P>) {
  type T = { collections?: C; globals?: G }
  type D = DefaultDepth<P>
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 }
  checkSchema(schema, defaults)
  checkFields(schema)
  const collections: Record<string, Collection> = schema.collections ?? {}
  const globals: Record<string, Global> = schema.globals ?? {}
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
    try {
      if (operation === 'read' || operation === 'getGlobal' || scope.trx) return await body()
      return await (await db()).transaction().execute((trx) => body(trx))
    } catch (error) {
      // Only the outermost call runs `afterError`, after the rollback. 400 and 409 are expected and run none.
      if (!scope.nested && !(error instanceof ValidationError || error instanceof ConflictError)) {
        const s: Scope = { ...scope, trx: undefined, context, nested: true }
        const args = { ...common({ ...s, cms: bind(s) as unknown as LocalApi }, name), operation, error }
        const slots = [name.collection ? collections[name.collection].hooks?.afterError : undefined, rootHooks.afterError]
        for (const fn of slots.flatMap(list)) {
          // An error here MUST NOT replace the original one.
          try {
            await fn(args)
          } catch (e) {
            consola.withTag('integral').error(e)
          }
        }
      }
      throw error
    }
  }

  // `effect`: an `onDelete` effect. It skips id checks, because other relations of the document MAY point to
  // documents that the same delete removes.
  const update = (scope: Scope, collection: string, id: string, data: unknown, effect = false) =>
    run(scope, 'update', { collection }, { collection, id, data }, (s, args) => write(s, { collection }, 'update', args.data, { id: args.id, effect }))
  const setGlobal = (scope: Scope, name: string, data: unknown, effect = false) =>
    run(scope, 'setGlobal', { global: name }, { global: name, data }, (s, args) => write(s, { global: name }, 'setGlobal', args.data, { effect }))

  // The fields and hooks of a collection or global.
  const target = ({ collection, global }: Name) => (collection ? collections[collection] : globals[global!])

  // Shared by `create`, `update` and `setGlobal`. Returns `undefined` for a missing document.
  async function write(s: Inner, name: Name, operation: 'create' | 'update' | 'setGlobal', input: unknown, { id, effect }: WriteOptions = {}) {
    const { fields, hooks: h } = target(name)
    const db = await q(s)
    const originalDoc = name.global ? await loadGlobal(s, name.global) : id ? await load(s, name.collection!, id) : undefined
    if (id && !originalDoc) return undefined
    const base = { ...common(s, name), operation, id, originalDoc }
    const fieldArgs = (data: Record<string, unknown>) => ({ ...common(s, name), operation, data, originalDoc })
    // Built per write, because conditions depend on the data.
    const validate = (data: unknown) => parseData(dataSchema(fields, data), data)
    // `update` and `setGlobal` change only the top-level keys they get. The others keep their stored values.
    const copy = originalDoc && isObject(input) ? { ...stripMeta(originalDoc), ...structuredClone(input) } : structuredClone(input)
    if (operation === 'create' && isObject(copy)) await applyDefaults(fields, copy, common(s, name))
    if (isObject(copy)) await fieldHooks('beforeValidate', fields, copy, fieldArgs(copy))
    const valid = validate(await hooks(h?.beforeValidate, 'data', copy, base))
    // `onDelete` effects only clear references, so the document's own rules do not apply.
    if (!effect) {
      const errors: Record<string, string> = {}
      await runValidate(fields, valid, fieldArgs(valid), errors)
      if (Object.keys(errors).length) throw new ValidationError(errors)
    }
    await fieldHooks('beforeChange', fields, valid, fieldArgs(valid))
    // Validated again, so a hook cannot store invalid data.
    const data = validate(await hooks(h?.beforeChange, 'data', valid, base))
    if (name.collection) await checkUnique(db, name.collection, fields, data, id)
    if (!effect) await checkRefs(db, fields, data, id ? { collection: name.collection!, id } : undefined)
    const now = Date.now()
    const json = JSON.stringify(data)
    let stored: Record<string, any>
    if (name.global) {
      await db
        .insertInto('cms_globals')
        .values({ name: name.global, data: json, created_at: now, updated_at: now })
        .onConflict((oc) => oc.column('name').doUpdateSet({ data: json, updated_at: now }))
        .execute()
      stored = data
    } else if (id) {
      stored = toDoc(
        await db
          .updateTable('cms_documents')
          .set({ data: json, updated_at: now })
          .where('collection', '=', name.collection!)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow(),
      )
    } else {
      stored = toDoc(
        await db
          .insertInto('cms_documents')
          .values({ id: crypto.randomUUID(), collection: name.collection!, data: json, created_at: now, updated_at: now })
          .returningAll()
          .executeTakeFirstOrThrow(),
      )
    }
    await fieldHooks('afterChange', fields, stored, fieldArgs(stored))
    const doc = await hooks(h?.afterChange, 'doc', stored, { ...common(s, name), operation, previousDoc: originalDoc })
    return (await afterRead(s, name, [doc], operation))[0]
  }

  // Field `afterRead` per document, then the collection's or global's once for the batch.
  async function afterRead(s: Inner, name: Name, docs: Record<string, any>[], operation: Operation) {
    const { fields, hooks: h } = target(name)
    for (const doc of docs) await fieldHooks('afterRead', fields, doc, { ...common(s, name), operation, data: doc })
    return hooks(h?.afterRead, 'docs', docs, { ...common(s, name), operation })
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
    await populate(await q(s), collections, fields, docs, spec(options), readHooks(s))
    return afterRead(s, { collection }, docs, 'read')
  }

  // Populated documents run their own collection's read hooks, in the scope of the outer read.
  const readHooks = (s: Inner): ReadHooks => ({
    before: (collection, docs) => hooks(collections[collection].hooks?.beforeRead, 'docs', docs, { ...common(s, { collection }), operation: 'read' }),
    after: (collection, docs) => afterRead(s, { collection }, docs, 'read'),
  })

  // The stored data of a global, or `undefined` if it was never saved.
  async function loadGlobal(s: Scope, name: string) {
    const row = await (await q(s)).selectFrom('cms_globals').select('data').where('name', '=', name).executeTakeFirst()
    return row && (JSON.parse(row.data) as Record<string, any>)
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
          write(s, { collection }, 'create', args.data),
        )) as CollectionDoc<T, K>
      },

      /**
       * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one.
       * Returns `undefined` if the document does not exist. Throws a `ValidationError` for invalid data.
       */
      async update<K extends keyof Collections<T> & string>(collection: K, id: string, data: Record<string, unknown>) {
        if (!Object.hasOwn(collections, collection)) return undefined
        return (await update(scope, collection, id, data)) as CollectionDoc<T, K> | undefined
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
          const db = await q(s)
          await db.deleteFrom('cms_documents').where('collection', '=', collection).where('id', '=', args.id).execute()
          await onDelete(db, schema, collection, args.id, {
            update: (collection, id, data) => update(s, collection, id, data, true),
            setGlobal: (name, data) => setGlobal(s, name, data, true),
            delete: (collection, id) => s.cms.delete(collection, id),
          })
          await hooks(h?.afterDelete, 'doc', doc, base)
        })
      },

      /** Returns a global. Fields that were never saved are missing. */
      async getGlobal<K extends keyof Globals<T> & string, const O extends ReadOptions<Collections<T>, Globals<T>[K]['fields']> = {}>(
        name: K,
        options: Checked<O, Collections<T>, Globals<T>[K]['fields']> = {} as never,
      ): Promise<ReadGlobal<T, K, O, D>> {
        if (!Object.hasOwn(globals, name)) throw new Error(`Unknown global "${name}"`)
        const { fields, hooks: h } = globals[name]
        return run(scope, 'getGlobal', { global: name }, { global: name, options }, async (s, args) => {
          const base = { ...common(s, { global: name }), operation: 'getGlobal' as const }
          const docs = await hooks(h?.beforeRead, 'docs', [(await loadGlobal(s, name)) ?? {}], base)
          await populate(await q(s), collections, fields, docs, spec(args.options), readHooks(s))
          return (await afterRead(s, { global: name }, docs, 'getGlobal'))[0]
        }) as Promise<ReadGlobal<T, K, O, D>>
      },

      /** Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Throws a `ValidationError` for invalid data. */
      async setGlobal<K extends keyof Globals<T> & string>(name: K, data: Record<string, unknown>) {
        if (!Object.hasOwn(globals, name)) throw new Error(`Unknown global "${name}"`)
        return (await setGlobal(scope, name, data)) as GlobalData<T, K>
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

  const app = createApp(cms as unknown as Cms<Schema>, (user) => ({ ...cms, ...bind({ user, context: {}, nested: false }) }) as unknown as Cms<Schema>)
  return cms
}

type Name = { collection?: string; global?: string }
type WriteOptions = { id?: string; effect?: boolean }

// The stored data of a document, without `id`, `createdAt` and `updatedAt`.
const stripMeta = ({ id, createdAt, updatedAt, ...data }: Record<string, unknown>) => data
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

// Fills `undefined` fields in place. Children of a group get defaults only when the group is present.
async function applyDefaults(fields: Fields, data: Record<string, unknown>, args: HookArgs) {
  for (const [key, f] of Object.entries(fields)) {
    if (f.type === 'join') continue
    if (data[key] === undefined && f.default !== undefined) data[key] = typeof f.default === 'function' ? await f.default(args) : structuredClone(f.default)
    const group = data[key]
    if (f.type === 'group' && isObject(group)) await applyDefaults(f.fields, group, args)
  }
}

// ponytail: one scan per unique field per write. Add SQLite expression indexes if collections grow large.
async function checkUnique(db: Kysely<Database>, collection: string, fields: Fields, data: Record<string, unknown>, id?: string) {
  const errors: Record<string, string> = {}
  for (const [key, f] of Object.entries(fields)) {
    if (!('unique' in f) || !f.unique || data[key] == null) continue
    let query = db
      .selectFrom('cms_documents')
      .select('id')
      .where('collection', '=', collection)
      .where(sql<boolean>`json_extract(data, ${`$.${key}`}) = ${data[key]}`)
    if (id) query = query.where('id', '!=', id)
    if (await query.executeTakeFirst()) errors[key] = 'Already used'
  }
  if (Object.keys(errors).length) throw new ValidationError(errors)
}

// Collects the messages of field `validate` functions by path. Fields whose condition is false are skipped.
async function runValidate(fields: Fields, siblingData: Record<string, any>, args: Omit<FieldArgs, 'siblingData' | 'path'>, errors: Record<string, string>, prefix = '') {
  for (const [key, f] of Object.entries(fields)) {
    if (f.type === 'join' || (f.condition && !matchCondition(f.condition, args.data, siblingData))) continue
    const path = prefix + key
    const result = await f.validate?.(siblingData[key], { ...args, siblingData, path })
    if (typeof result === 'string') errors[path] = result
    const group = siblingData[key]
    if (f.type === 'group' && isObject(group)) await runValidate(f.fields, group, args, errors, `${path}.`)
  }
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

export type Cms<T extends Schema> = ReturnType<typeof defineCms<NonNullable<T['collections']>, NonNullable<T['globals']>>>
