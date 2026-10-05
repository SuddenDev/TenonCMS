import type { User } from "better-auth";

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
import type { MediaApi } from "./media.ts";
export type { RootHooks } from "./root.ts";

export type Awaitable<T> = T | Promise<T>;
// Method syntax makes the parameter bivariant, so a typed collection is still a `Collection`.
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

type Options = {
  where?: Record<string, unknown>;
  limit?: number;
  populate?: boolean | object;
  depth?: number;
  select?: Record<string, unknown>;
};
type Row = Record<string, any>;

/** Options of `create`, `update` and `setGlobal`. */
export type WriteOptions = {
  /** Saves a draft: the published data stays. Types are checked, but not `required`, the built-in checks, `validate`, `unique` or ids. */
  draft?: boolean;
};

/** The local API with untyped names and data, as hooks get it. */
export type LocalApi = {
  find(collection: string, options?: Options): Promise<Row[]>;
  findOne(collection: string, options: Options): Promise<Row | undefined>;
  findById(collection: string, id: string, options?: Options): Promise<Row | undefined>;
  create(collection: string, data: Record<string, unknown>, options?: WriteOptions): Promise<Row>;
  update(
    collection: string,
    id: string,
    data: Record<string, unknown>,
    options?: WriteOptions,
  ): Promise<Row | undefined>;
  delete(collection: string, id: string): Promise<void>;
  publish(collection: string, id: string): Promise<Row | undefined>;
  discard(collection: string, id: string): Promise<Row | undefined>;
  getGlobal(name: string, options?: Options): Promise<Row>;
  setGlobal(name: string, data: Record<string, unknown>, options?: WriteOptions): Promise<Row>;
  publishGlobal(name: string): Promise<Row>;
  discardGlobal(name: string): Promise<Row>;
  /** Returns a copy of this API whose reads use the drafts perspective: unpublished documents and pending drafts. */
  withDrafts(): LocalApi;
  /** The media library. Missing without `defineCms({ media })`. */
  media?: MediaApi;
};

/** Arguments every hook gets. */
export type HookArgs = {
  /** The local API, bound to the current transaction. Nested calls run their own hooks. Untyped. */
  cms: LocalApi;
  /** The session user of an HTTP request or of `cms.withSession()`. `null` without a session and for server calls of the local API. */
  user: User | null;
  /** One object shared by all hooks of an operation and every nested call inside it. Use it to pass values along or to stop loops. */
  context: Record<string, unknown>;
  /** Name of the collection. Missing for globals. */
  collection?: string;
  /** Name of the global. Missing for collections. */
  global?: string;
  /** True on a draft save, which runs no `validate`, `afterChange` or integrity checks. False otherwise, publish included. */
  draft: boolean;
};
