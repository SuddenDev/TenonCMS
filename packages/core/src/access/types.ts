import type { Awaitable, HookArgs } from "../schema/hooks/index.ts";

/**
 * Equality filters on top-level keys, `createdBy` and `updatedBy`, like the `where` of `find()`. `null` matches an
 * empty or missing value.
 */
export type Where = Record<string, string | number | boolean | null>;

/** What every rule gets: the caller and the `cms` of hooks, which skips the rules. */
export type AccessArgs = Pick<
  HookArgs,
  "user" | "apiKey" | "cms" | "context" | "collection" | "global" | "locale"
>;

/**
 * Who MAY run an operation:
 * - `true` or `false`: everyone or no one.
 * - A list of role names: signed-in users with one of these roles. A user without a role counts as `editor`. There
 *   is no admin bypass, so `["editor"]` excludes `admin`.
 * - A function. Method syntax makes its parameter bivariant, so typed hosts stay assignable.
 */
export type Rule<A, R = boolean> =
  | boolean
  | readonly string[]
  | { rule(args: AccessArgs & A): Awaitable<R> }["rule"];

/**
 * The `access` rules of a collection or of the media library. The server `cms` and the `cms` of hooks skip them;
 * HTTP requests and `cms.withSession()` are checked. Denied without a user is 401 (`ForbiddenError`), with a user 403.
 */
export type Access = {
  /**
   * Reads, and documents loaded by `populate` and rich text links. A `where` limits the documents; outside it
   * `findById` is `undefined`, a relation `null`. Default: published documents for everyone, drafts with a user.
   */
  read?: Rule<{ draft: boolean; id?: string }, boolean | Where>;
  /** `create`, and media uploads. Default: signed-in users. */
  create?: Rule<{ data: unknown }>;
  /**
   * `update`, draft saves, `publish`, `unpublish`, `discard`, `copyLocale` and `removeLocale`. With a `where`, the document as the
   * drafts perspective reads it MUST match. `id` and `data` are missing when the admin asks for permissions. Default:
   * signed-in users.
   */
  update?: Rule<{ id?: string; data?: unknown }, boolean | Where>;
  /** `delete`. With a `where`, the document MUST match. `id` is missing when the admin asks. Default: signed-in users. */
  delete?: Rule<{ id?: string }, boolean | Where>;
};

/** The `access` rules of a global. Defaults like {@link Access}. */
export type GlobalAccess = {
  /** `getGlobal`. Default: the published global for everyone, the draft with a user. */
  read?: Rule<{ draft: boolean }>;
  /** `setGlobal`, draft saves, `publishGlobal`, `unpublishGlobal`, `discardGlobal` and the locale operations. Default: signed-in users. */
  update?: Rule<{ data?: unknown }>;
};

/** The arguments of a field rule. */
export type FieldAccessArgs = {
  /** The stored document: the one read, or the one an update changes. Missing on create and when the admin asks. */
  doc?: Record<string, any>;
  /** The input of a write. */
  data?: Record<string, any>;
  /** The object that holds the field: a group, an item or the document. */
  siblingData?: Record<string, any>;
  /** Dot path of the field, with item indexes: `links.2.note`. */
  path: string;
};

/**
 * The `access` rules of a field. Default: allowed. A join takes `read` only.
 * - `read` denied: the field is missing from results, and a filter on it is a 400.
 * - `create` or `update` denied: an input value is dropped, and the stored one stays.
 */
export type FieldAccess = {
  read?: Rule<FieldAccessArgs>;
  create?: Rule<FieldAccessArgs>;
  update?: Rule<FieldAccessArgs>;
};
