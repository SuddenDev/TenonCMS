// This file MUST stay free of imports. Presets import it in browser bundles, where zod MUST NOT go.

/** A document or global that holds a reference. */
export type Reference = { collection: string; id: string } | { global: string }

/** Thrown when a delete hits `restrict` references. HTTP returns 409 with `references`. */
export class ConflictError extends Error {
  constructor(public references: Reference[]) {
    super('Referenced by other documents')
  }
}
