import { z } from 'zod'

type Base = { label?: string; required?: boolean }

export type Field =
  | (Base & { type: 'text' | 'textarea' | 'date' })
  | (Base & { type: 'number' })
  | (Base & { type: 'boolean' })
  | (Base & { type: 'select'; options: readonly string[] })
  /** Stored as a string. The admin renders it with the input registered under the name, e.g. `custom:color` → `fields.color`. */
  | (Base & { type: `custom:${string}` })
  | (Base & { type: 'group'; fields: Fields })
  /** Stores the id of a document in `collection`, or an array of ids with `many`. */
  | (Base & { type: 'relation'; collection: string; many?: boolean; onDelete?: 'set-null' | 'restrict' | 'cascade' })
  /** Not stored. Lists the documents of `collection` whose relation at `on` points here. */
  | { type: 'join'; label?: string; collection: string; on: string; required?: never }

export type Fields = Record<string, Field>

export type Collection = {
  label?: string
  fields: Fields
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string
}

export type Global = { label?: string; fields: Fields }

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
