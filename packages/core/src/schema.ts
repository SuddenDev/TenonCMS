import type { User } from 'better-auth'
import { z } from 'zod'
import { ValidationError } from './errors.ts'

type Base<V = string> = {
  /** Label in the admin. Defaults to the field key. */
  label?: string
  /** The value MUST be present on create and update. Optional fields read as `null` or missing. */
  required?: boolean
  /** Functions that run for this field on every write and read. Field hooks run before the collection's or global's hooks. */
  hooks?: FieldHooks<V>
}

/** One field of a collection, a global or a group. `type` picks the kind of value. */
export type Field =
  | (Base & {
      /** `text`: one line. `textarea`: several lines. `date`: an ISO date string (`2026-09-24`). */
      type: 'text' | 'textarea' | 'date'
    })
  | (Base<number> & { type: 'number' })
  | (Base<boolean> & { type: 'boolean' })
  | (Base & {
      type: 'select'
      /** The allowed values. The stored value is one of them. */
      options: readonly string[]
    })
  | (Base & {
      /** Stored as a string. The admin renders it with the input registered under the name, e.g. `custom:color` → `fields.color`. */
      type: `custom:${string}`
    })
  | (Base<Record<string, unknown>> & {
      /** Nests fields under one key, stored as an object. The admin shows it as its own section. Not filterable. */
      type: 'group'
      /** The nested fields. Groups MAY contain groups. */
      fields: Fields
    })
  | (Base<unknown> & {
      /** Stores the id of a document in `collection`. Reads resolve it to the document, see `populate`. */
      type: 'relation'
      /** Name of the collection the ids point to. It MAY be the collection that holds this field. */
      collection: string
      /** Store an array of ids instead of one id. Not filterable. With `required`, at least one id. */
      many?: boolean
      /**
       * What happens to this field when the referenced document is deleted:
       * - `'set-null'`: this field becomes `null`; in a `many` relation, the id is removed from the array.
       * - `'restrict'`: the delete fails with 409 and lists the referencing documents. Nothing changes.
       * - `'cascade'`: this document is deleted too, with its own `onDelete` rules. Not allowed in globals.
       *
       * Default: `'restrict'` when `required`, else `'set-null'`. `required` with `'set-null'` is not allowed.
       */
      onDelete?: 'set-null' | 'restrict' | 'cascade'
    })
  | {
      /** Not stored. Lists the documents of `collection` whose relation at `on` points here. Only in collections, at the top level. */
      type: 'join'
      /** Label in the admin. Defaults to the field key. */
      label?: string
      /** Name of the collection whose documents point here. */
      collection: string
      /** Path of the relation field in `collection` that points here, e.g. `author` or `seo.image`. */
      on: string
      required?: never
    }

export type Fields = Record<string, Field>

export type Collection<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the collection key. */
  label?: string
  fields: F
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>
}

export type Global<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the global key. */
  label?: string
  fields: F
  /** Functions that run on every read and write of this global. Typed only through `defineGlobal()`. */
  hooks?: GlobalHooks<F>
}

export type Schema = {
  collections?: Record<string, Collection>
  globals?: Record<string, Global>
}

type Awaitable<T> = T | Promise<T>
// Method syntax makes the parameter bivariant, so a typed collection is still a `Collection`.
type Fn<A, R> = { hook(args: A): Awaitable<R | void> }['hook']

/** Hooks of one stage. An array, or a record whose keys name the hooks, so a host can leave one out by name. They run in order. */
export type Slot<F> = F[] | Record<string, F>

/**
 * The operation a hook runs in:
 * - `'create'`, `'update'`, `'delete'`: a collection write.
 * - `'read'`: `find`, `findOne` and `findById`, and documents loaded by `populate`.
 * - `'getGlobal'`, `'setGlobal'`: a global read or write.
 */
export type Operation = 'create' | 'update' | 'delete' | 'read' | 'getGlobal' | 'setGlobal'

type Options = { where?: Record<string, unknown>; limit?: number; populate?: boolean | object; depth?: number }
type Row = Record<string, any>

/** The local API with untyped names and data, as hooks get it. */
export type LocalApi = {
  find(collection: string, options?: Options): Promise<Row[]>
  findOne(collection: string, options: Options): Promise<Row | undefined>
  findById(collection: string, id: string, options?: Options): Promise<Row | undefined>
  create(collection: string, data: Record<string, unknown>): Promise<Row>
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Row | undefined>
  delete(collection: string, id: string): Promise<void>
  getGlobal(name: string, options?: Options): Promise<Row>
  setGlobal(name: string, data: Record<string, unknown>): Promise<Row>
}

/** Arguments every hook gets. */
export type HookArgs = {
  /** The local API, bound to the current transaction. Nested calls run their own hooks. Untyped. */
  cms: LocalApi
  /** The session user of an HTTP write. `null` for public reads and for server calls of the local API. */
  user: User | null
  /** One object shared by all hooks of an operation and every nested call inside it. Use it to pass values along or to stop loops. */
  context: Record<string, unknown>
  /** Name of the collection. Missing for globals. */
  collection?: string
  /** Name of the global. Missing for collections. */
  global?: string
}

type FieldHook<V> = Fn<
  HookArgs & {
    /** The field's value. Return a new value to replace it. */
    value: V | null | undefined
    /** The whole document. Untyped. */
    data: Record<string, unknown>
    /** The object that holds this field: `data` at the top level, the group's value inside a group. Untyped. */
    siblingData: Record<string, unknown>
    /** The stored document before this write. Missing on create and on reads. Untyped. */
    originalDoc?: Record<string, unknown>
    /** Dot path of the field, e.g. `seo.title`. */
    path: string
    operation: Operation
  },
  V | null | undefined
>

/** Hooks of one field. A hook MAY return a new value; `undefined` keeps the old one. */
export type FieldHooks<V> = {
  /** Runs on unvalidated input, before schema validation. */
  beforeValidate?: Slot<FieldHook<V>>
  /** Runs on validated data, before the write. Its result is validated again. */
  beforeChange?: Slot<FieldHook<V>>
  /** Runs after the write, on the stored document. */
  afterChange?: Slot<FieldHook<V>>
  /** Runs once per document on every read and after writes. */
  afterRead?: Slot<FieldHook<V>>
}

// A collection written inline in `defineCms` has the wide `Fields`, so its hooks get `any`.
type D<F extends Fields> = Fields extends F ? any : Data<F>
type DocOf<F extends Fields> = Fields extends F ? any : Doc<F>

type ChangeArgs = HookArgs & {
  operation: Operation
  /** Id of the document. Missing on create and for globals. */
  id?: string
}

/**
 * Hooks of a collection. Each hook gets one object and MAY be async. A hook MAY return a replacement for its main value
 * (`args`, `data`, `doc`, `docs`, `result`); `undefined` keeps it.
 *
 * Order of a write: `beforeOperation` → `beforeValidate` → validation → `beforeChange` → validation → write → `afterChange` → `afterRead` → `afterOperation`.
 * Field hooks of a stage run before the collection's.
 */
export type CollectionHooks<F extends Fields> = {
  /** Runs first in every operation. `args` is the operation's input, e.g. `{ collection, id, data }`. */
  beforeOperation?: Slot<Fn<HookArgs & { operation: Operation; args: Record<string, unknown> }, Record<string, unknown>>>
  /** Runs on unvalidated input of `create` and `update`. The result is validated. */
  beforeValidate?: Slot<Fn<ChangeArgs & { data: Partial<D<F>>; originalDoc?: DocOf<F> }, Partial<D<F>>>>
  /** Runs on validated data, before the write. The result MUST pass validation again. */
  beforeChange?: Slot<Fn<ChangeArgs & { data: D<F>; originalDoc?: DocOf<F> }, D<F>>>
  /** Runs after the write, in the same transaction. `previousDoc` is missing on create. */
  afterChange?: Slot<Fn<HookArgs & { operation: Operation; doc: DocOf<F>; previousDoc?: DocOf<F> }, DocOf<F>>>
  /** Runs once per read on the loaded documents, before relations are resolved. */
  beforeRead?: Slot<Fn<HookArgs & { operation: Operation; docs: DocOf<F>[] }, DocOf<F>[]>>
  /** Runs once per read on all returned documents, and after writes on the written one. */
  afterRead?: Slot<Fn<HookArgs & { operation: Operation; docs: DocOf<F>[] }, DocOf<F>[]>>
  /** Runs before a document is deleted. Does not run for a missing document. */
  beforeDelete?: Slot<Fn<HookArgs & { id: string; doc: DocOf<F> }, void>>
  /** Runs after the document and its `onDelete` effects are deleted, in the same transaction. */
  afterDelete?: Slot<Fn<HookArgs & { id: string; doc: DocOf<F> }, void>>
  /** Runs last in every operation. `result` is what the operation returns. */
  afterOperation?: Slot<Fn<HookArgs & { operation: Operation; args: Record<string, unknown>; result: unknown }, unknown>>
  /**
   * Runs after an unexpected error, once the transaction is rolled back, then the root `afterError`.
   * Does not run for `ValidationError` (400) or `ConflictError` (409). The error is rethrown.
   */
  afterError?: Slot<Fn<HookArgs & { operation: Operation; error: unknown }, void>>
}

/** Hooks of a global. Same as {@link CollectionHooks}; `docs` holds the one global. */
export type GlobalHooks<F extends Fields> = Pick<CollectionHooks<F>, 'beforeValidate' | 'beforeChange' | 'afterChange' | 'beforeRead' | 'afterRead'>

/** Hooks of `defineCms`. */
export type RootHooks = {
  /** Runs after an unexpected error in any operation, after the collection's `afterError`. Not for 400 or 409. */
  afterError?: Slot<Fn<HookArgs & { operation: Operation; error: unknown }, void>>
}

type FieldValue<F extends Field> = F extends { type: 'group'; fields: infer G extends Fields }
  ? Data<G>
  : F extends { type: 'number' }
    ? number
    : F extends { type: 'boolean' }
      ? boolean
      : F extends { type: 'select'; options: readonly (infer O)[] }
        ? O
        : F extends { type: 'relation' }
          ? F extends { many: true }
            ? string[]
            : string
          : string

export type Data<F extends Fields> = {
  [K in keyof F as F[K] extends { type: 'join' } ? never : F[K]['required'] extends true ? K : never]: FieldValue<F[K]>
} & {
  [K in keyof F as F[K] extends { type: 'join' } ? never : F[K]['required'] extends true ? never : K]?: FieldValue<F[K]> | null
}

/** Field keys that `where` accepts. Groups, joins and `many` relations are not filterable. */
export type FilterKey<F extends Fields> = {
  [K in keyof F]: F[K] extends { type: 'group' | 'join' } | { many: true } ? never : K
}[keyof F]

export type Doc<F extends Fields> = Data<F> & {
  id: string
  createdAt: string
  updatedAt: string
}

/** Dot paths of relation fields in `F` that point to `Target`, through groups. */
type RelationPaths<F, Target extends string, P extends string = ''> = {
  [K in keyof F & string]: F[K] extends { type: 'group'; fields: infer G }
    ? RelationPaths<G, Target, `${P}${K}.`>
    : F[K] extends { type: 'relation'; collection: Target }
      ? `${P}${K}`
      : never
}[keyof F & string]

/** An error type. No value matches it, so the type error shows `message` and the values `use` allows. */
type Invalid<M extends string, U = never> = { message: M; use: U }

/** The error for an invalid join `on`, with the relation paths it may use. */
type JoinError<F, N extends string, Self extends string> = [RelationPaths<F, Self>] extends [never]
  ? Invalid<`no relation in '${N}' points to '${Self}'`>
  : Invalid<`not a relation in '${N}' that points to '${Self}'`, RelationPaths<F, Self>>

/** `F` with each invalid `collection` or `on` replaced by the values it accepts, so the error names them. */
// Widened `string` values are not checked; only literals can be.
type CheckFields<F, C, Self extends string> = {
  [K in keyof F]: F[K] extends { type: 'group'; fields: infer G }
    ? { [P in keyof F[K]]: P extends 'fields' ? CheckFields<G, C, Self> : F[K][P] }
    : F[K] extends { type: 'relation' | 'join'; collection: infer N }
      ? string extends N
        ? F[K]
        : N extends keyof C
        ? F[K] extends { type: 'join'; on: infer O }
          ? string extends O
            ? F[K]
            : O extends RelationPaths<FieldsOf<C, N>, Self>
            ? F[K]
            : { [P in keyof F[K]]: P extends 'on' ? JoinError<FieldsOf<C, N>, N & string, Self> : F[K][P] }
          : F[K]
        : { [P in keyof F[K]]: P extends 'collection' ? Invalid<`'${N & string}' is not a collection`, keyof C & string> : F[K][P] }
      : F[K]
}

/**
 * Checks every relation and join in `S` against the collections in `C`.
 * Resolves to `S` when all are valid. Use it as `S & NoInfer<CheckRefs<S, C>>`, so `S` is inferred from the argument alone.
 */
export type CheckRefs<S, C> = S extends { [K in keyof S]: { fields: unknown } }
  ? { [K in keyof S]: { [P in keyof S[K]]: P extends 'fields' ? CheckFields<S[K][P], C, K & string> : S[K][P] } } extends infer R
    ? S extends R
      ? S
      : R
    : never
  : S

export function defineCollection<const F extends Fields, const T extends Omit<Collection<F>, 'fields' | 'hooks'>>(
  collection: T & { fields: F; hooks?: CollectionHooks<NoInfer<F>> },
): T & { fields: F; hooks?: CollectionHooks<F> } {
  return collection
}

export function defineGlobal<const F extends Fields, const T extends Omit<Global<F>, 'fields' | 'hooks'>>(
  global: T & { fields: F; hooks?: GlobalHooks<NoInfer<F>> },
): T & { fields: F; hooks?: GlobalHooks<F> } {
  return global
}

/** Whether `where` accepts `key`. Groups, joins and `many` relations are not filterable. */
export function filterable(fields: Fields, key: string) {
  if (!Object.hasOwn(fields, key)) return false
  const field = fields[key]
  return field.type !== 'group' && field.type !== 'join' && !(field.type === 'relation' && field.many)
}

function fieldSchema(field: Field): z.ZodType {
  switch (field.type) {
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'date':
      return z.iso.date()
    case 'select':
      return z.enum(field.options as [string, ...string[]])
    case 'group':
      return dataSchema(field.fields)
    case 'relation': {
      const id = z.string().min(1)
      if (!field.many) return id
      const ids = z.array(id).refine((a) => new Set(a).size === a.length, 'Duplicate id')
      return field.required ? ids.min(1) : ids
    }
    default:
      return field.required ? z.string().min(1) : z.string()
  }
}

/** Validates `data`. Throws a `ValidationError` keyed by field path. */
export function parseData(schema: z.ZodType, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) throw new ValidationError(Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])))
  return result.data as Record<string, unknown>
}

/** Builds the validator for written data. Unknown keys are stripped. */
export function dataSchema(fields: Fields) {
  return z.object(
    Object.fromEntries(
      Object.entries(fields).flatMap(([name, field]) => {
        if (field.type === 'join') return []
        const s = fieldSchema(field)
        return [[name, field.required ? s : s.optional().nullable()]]
      }),
    ),
  )
}

// Read types. `Cs` is the collections record. `P` is `false` (ids), a number (hops left) or a populate object.
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
type Meta = { id: string; createdAt: string; updatedAt: string }
type Simplify<T> = { [K in keyof T]: T[K] } & {}

type Sub<P, K> = P extends number ? P : P extends object ? (K extends keyof P ? P[K] : false) : false
type Next<S> = S extends true ? false : S extends number ? Prev[S] : S
type Target<Cs, C, P> = C extends keyof Cs
  ? Cs[C] extends { fields: infer F extends Fields }
    ? Simplify<Resolve<Cs, F, P> & Meta>
    : never
  : never

type Value<Cs, F, S> = F extends { type: 'group'; fields: infer G extends Fields }
  ? Resolve<Cs, G, S extends true ? 1 : S>
  : F extends { type: 'relation'; collection: infer C }
    ? S extends false | 0 | undefined
      ? F extends { many: true }
        ? string[]
        : string
      : F extends { many: true }
        ? Target<Cs, C, Next<S>>[]
        : Target<Cs, C, Next<S>>
    : F extends { type: 'join'; collection: infer C }
      ? Target<Cs, C, Next<S>>[]
      : F extends Field
        ? FieldValue<F>
        : never

// Joins are absent unless named in a populate object.
type Joins<F, P> = {
  [K in keyof F]: F[K] extends { type: 'join' } ? (P extends object ? (K extends keyof P ? never : K) : K) : never
}[keyof F]
type Req<F> = { [K in keyof F]: F[K] extends { required: true } | { type: 'join' } ? K : never }[keyof F]

/** Data of `fields` as a read returns it, with relations resolved as `P` says. */
export type Resolve<Cs, F extends Fields, P> = Simplify<
  { [K in Exclude<keyof F, Req<F> | Joins<F, P>>]?: Value<Cs, F[K], Sub<P, K>> | null } & {
    [K in Exclude<Req<F>, Joins<F, P>>]: Value<Cs, F[K], Sub<P, K>>
  }
>

// An untyped schema (the admin's) reads plain records. The recursive types would not terminate.
type Wide<Cs> = string extends keyof Cs ? true : false
export type Read<Cs, F extends Fields, P> = Wide<Cs> extends true ? Record<string, any> : Resolve<Cs, F, P>
export type ReadDoc<Cs, F extends Fields, P> = Simplify<Read<Cs, F, P> & Meta>
export type PopulateOf<O, D extends number> = O extends { populate: false }
  ? false
  : O extends { populate: infer P extends object }
    ? P
    : O extends { depth: infer N extends number }
      ? N
      : D

type FieldsOf<Cs, C> = C extends keyof Cs ? (Cs[C] extends { fields: infer F extends Fields } ? F : never) : never

/** Paths a `populate` object may name: groups, relations and joins, nested along their targets. */
export type Populate<Cs, F extends Fields> = {
  [K in keyof F as F[K] extends { type: 'group' | 'relation' | 'join' } ? K : never]?: F[K] extends {
    type: 'group'
    fields: infer G extends Fields
  }
    ? true | Populate<Cs, G>
    : F[K] extends { collection: infer C }
      ? true | Populate<Cs, FieldsOf<Cs, C>>
      : never
}
export type PopulateArg<Cs, F extends Fields> = Wide<Cs> extends true ? Record<string, unknown> : Populate<Cs, F>

// Generic inference skips excess property checks, so extra keys map to `never` at every level.
export type Exact<P, A> = P extends object
  ? { [K in keyof P]: K extends keyof A ? Exact<P[K], Exclude<A[K], true | undefined>> : never }
  : P

/** Read options of `find`, `findOne`, `findById` and `getGlobal`. */
export type ReadOptions<Cs, F extends Fields> = {
  /** `false` returns ids. An object resolves only the listed paths, `true` one hop. Default: every relation up to `depth`. */
  populate?: boolean | PopulateArg<Cs, F>
  /** Hops resolved when `populate` is not an object. */
  depth?: number
}
/** Checks a `populate` object literal in `O` against the fields at every level. */
export type Checked<O extends ReadOptions<Cs, F>, Cs, F extends Fields> = O & {
  populate?: Exact<O['populate'], PopulateArg<Cs, F>>
}
