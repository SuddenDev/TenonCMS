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
