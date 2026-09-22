import { z } from 'zod'

type Base = { label?: string; required?: boolean }

export type Field =
  | (Base & { type: 'text' | 'textarea' | 'date' })
  | (Base & { type: 'number' })
  | (Base & { type: 'boolean' })
  | (Base & { type: 'select'; options: readonly string[] })

export type Fields = Record<string, Field>

export type Collection = {
  label?: string
  fields: Fields
  // Field shown in the admin list view. Defaults to the first field.
  titleField?: string
}

export type Global = { label?: string; fields: Fields }

export type Config = {
  collections?: Record<string, Collection>
  globals?: Record<string, Global>
}

type FieldValue<F extends Field> = F extends { type: 'number' }
  ? number
  : F extends { type: 'boolean' }
    ? boolean
    : F extends { type: 'select'; options: readonly (infer O)[] }
      ? O
      : string

export type Data<F extends Fields> = {
  [K in keyof F as F[K]['required'] extends true ? K : never]: FieldValue<F[K]>
} & {
  [K in keyof F as F[K]['required'] extends true ? never : K]?: FieldValue<F[K]> | null
}

export type Doc<F extends Fields> = Data<F> & {
  id: string
  createdAt: string
  updatedAt: string
}

export function defineConfig<const T extends Config>(config: T): T {
  return config
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
    default:
      return field.required ? z.string().min(1) : z.string()
  }
}

// Builds the validator for data coming from the admin API. Unknown keys are stripped.
export function dataSchema(fields: Fields) {
  return z.object(
    Object.fromEntries(
      Object.entries(fields).map(([name, field]) => {
        const s = fieldSchema(field)
        return [name, field.required ? s : s.optional().nullable()]
      }),
    ),
  )
}
