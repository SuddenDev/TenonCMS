import type { Field } from "../schema/index.ts";

/** Who reads. `public`: a request without a session. `admin`: a request with a session. */
export type Visibility = "public" | "admin";

/**
 * Tells whether a caller with `visibility` can see field `f`. Private fields are visible only to `admin`.
 * @returns `true` when the field is visible.
 */
export const visible = (f: Field, visibility: Visibility) => visibility === "admin" || !f.private;
