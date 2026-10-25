import type { CmsUser } from "../../admin/index.d.ts";
import type { LocalApi } from "../../cms/api/local-api.ts";

export type { CollectionHooks } from "./collection.ts";
export type { FieldArgs, FieldHooks, Validate } from "./field.ts";
export type { GlobalHooks } from "./global.ts";
export type {
  MediaApi,
  MediaDoc,
  MediaHooks,
  MediaRead,
  MediaUpdate,
  UploadInfo,
} from "./media.ts";
export type { RootHooks } from "./root.ts";

export type Awaitable<T> = T | Promise<T>;

/** One hook. Method syntax makes the parameter bivariant, so a typed collection is still a `Collection`. */
export type Fn<A, R> = { hook(args: A): Awaitable<R | void> }["hook"];

/** Hooks of one stage. An array, or a record whose keys name the hooks, so a host can leave one out by name. They run in order. */
export type Slot<F> = F[] | Record<string, F>;

/**
 * The operation a hook runs in:
 * - `'create'`, `'update'`, `'delete'`: a collection write.
 * - `'read'`: `find`, `findOne` and `findById`, and documents loaded by `populate`.
 * - `'getGlobal'`, `'setGlobal'`: a global read or write.
 */
export type Operation = "create" | "update" | "delete" | "read" | "getGlobal" | "setGlobal";

/** Arguments every hook gets. */
export type HookArgs = {
  /** The local API, bound to the current transaction. Nested calls run their own hooks. Untyped. */
  cms: LocalApi;
  /** The session user of an HTTP request or of `cms.withSession()`. `null` without a session and for server calls of the local API. */
  user: CmsUser | null;
  /** One object shared by all hooks of an operation and every nested call inside it. Use it to pass values along or to stop loops. */
  context: Record<string, unknown>;
  /** Name of the collection. Missing for globals. */
  collection?: string;
  /** Name of the global. Missing for collections. */
  global?: string;
  /** True on a draft save, which runs no `validate`, `afterChange` or integrity checks. False otherwise, publish included. */
  draft: boolean;
  /** The locale of the operation. Nested calls inherit it. Missing without `localization`. */
  locale?: string;
};
