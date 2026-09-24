import { z } from 'zod'

type Base = {
  /** Label in the admin. Defaults to the field key. */
  label?: string
  /** The value MUST be present on create and update. Optional fields read as `null` or missing. */
  required?: boolean
}

/** One field of a collection, a global or a group. `type` picks the kind of value. */
export type Field =
  | (Base & {
      /** `text`: one line. `textarea`: several lines. `date`: an ISO date string (`2026-09-24`). */
      type: 'text' | 'textarea' | 'date'
    })
  | (Base & { type: 'number' })
  | (Base & { type: 'boolean' })
  | (Base & {
      type: 'select'
      /** The allowed values. The stored value is one of them. */
      options: readonly string[]
    })
  | (Base & {
      /** Stored as a string. The admin renders it with the input registered under the name, e.g. `custom:color` → `fields.color`. */
      type: `custom:${string}`
    })
  | (Base & {
      /** Nests fields under one key, stored as an object. The admin shows it as its own section. Not filterable. */
      type: 'group'
      /** The nested fields. Groups MAY contain groups. */
      fields: Fields
    })
  | (Base & {
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

export type Collection = {
  /** Name in the admin. Defaults to the collection key. */
  label?: string
  fields: Fields
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string
}

export type Global = {
  /** Name in the admin. Defaults to the global key. */
  label?: string
  fields: Fields
}

export type Schema = {
  collections?: Record<string, Collection>
  globals?: Record<string, Global>
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

export function defineCollection<const T extends Collection>(collection: T): T {
  return collection
}

export function defineGlobal<const T extends Global>(global: T): T {
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

/** Builds the validator for data coming from the admin API. Unknown keys are stripped. */
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
