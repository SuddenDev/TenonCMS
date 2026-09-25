// This file MUST stay free of imports. Presets import it in browser bundles, where zod MUST NOT go.

/** A document or global that holds a reference. */
export type Reference = { collection: string; id: string } | { global: string }

/** Thrown when a delete hits `restrict` references. HTTP returns 409 with `references`. */
export class ConflictError extends Error {
  constructor(public references: Reference[]) {
    super('Referenced by other documents')
  }
}

/**
 * Thrown for invalid data, by validation or by a hook: `throw new ValidationError({ slug: 'Already used' })`.
 * HTTP returns 400 with `{ errors }`, and the admin shows each message next to its field.
 */
export class ValidationError extends Error {
  constructor(
    /** Messages by field path, e.g. `{ 'seo.title': 'Too long' }`. The key `''` holds a message for the whole document. */
    public errors: Record<string, string>,
  ) {
    super(Object.values(errors)[0] ?? 'Invalid data')
  }
}
