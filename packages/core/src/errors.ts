// This file MUST stay free of imports. Presets import it in browser bundles, where zod MUST NOT go.

/** A document or global that holds a reference. */
export type Reference = { collection: string; id: string } | { global: string };

/** Thrown when a delete hits `restrict` references. HTTP returns 409 with `references`. */
export class ConflictError extends Error {
  constructor(public references: Reference[]) {
    super("Referenced by other documents");
  }
}

/**
 * Thrown when an access rule denies an operation. HTTP returns its `status`: 401 for a caller without a user, 403 for
 * a signed-in one.
 */
export class ForbiddenError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
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
    super(Object.values(errors)[0] ?? "Invalid data");
  }
}

/** An embedded link affected by deletion. */
export type LinkedReference = {
  collection?: string;
  id?: string;
  global?: string;
  field: string;
  locale?: string;
  draft?: boolean;
};
/** Explicit acknowledgement is required before breaking embedded links. */
export class LinkedContentError extends Error {
  readonly code = "LINKED_CONTENT";
  constructor(public references: LinkedReference[]) {
    super("Deleting this content will break links");
  }
}
/** Options for operations that can delete a document. */
export type DeleteOptions = { allowBrokenLinks?: boolean };
