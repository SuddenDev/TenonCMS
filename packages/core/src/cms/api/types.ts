import type {
  Checked,
  Data,
  Doc,
  FilterKey,
  PopulateOf,
  Read,
  ReadDoc,
  ReadOptions,
  Schema,
  GlobalMeta,
  SelectOf,
  WriteOptions,
} from "../../schema/index.ts";

type Collections<T extends Schema> = NonNullable<T["collections"]>;
type Globals<T extends Schema> = NonNullable<T["globals"]>;
type CollectionDoc<T extends Schema, K extends keyof Collections<T>> = Doc<
  Collections<T>[K]["fields"]
>;
type GlobalData<T extends Schema, K extends keyof Globals<T>> = Data<Globals<T>[K]["fields"]>;
type FindOptions<T extends Schema, K extends keyof Collections<T>> = ReadOptions<
  Collections<T>,
  Collections<T>[K]["fields"]
> & {
  /** Equality filters on field values. `null` matches an empty or missing field. `undefined` adds no filter. */
  where?: Partial<Record<FilterKey<Collections<T>[K]["fields"]>, string | number | boolean | null>>;
  /** Maximum number of documents. */
  limit?: number;
};
type ReadCollection<
  T extends Schema,
  K extends keyof Collections<T>,
  O,
  D extends number,
> = ReadDoc<Collections<T>, Collections<T>[K]["fields"], PopulateOf<O, D>, SelectOf<O>>;
type ReadGlobal<T extends Schema, K extends keyof Globals<T>, O, D extends number> = Partial<
  Read<Collections<T>, Globals<T>[K]["fields"], PopulateOf<O, D>, SelectOf<O>>
> &
  GlobalMeta<SelectOf<O>>;

/**
 * The typed local API of `defineCms()`. `D` is the default populate depth.
 */
export type Api<T extends Schema, D extends number> = {
  /**
   * Lists documents of a collection, newest first.
   * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
   */
  find<K extends keyof Collections<T> & string, const O extends FindOptions<T, K> = {}>(
    collection: K,
    options?: Checked<O, Collections<T>, Collections<T>[K]["fields"], D>,
  ): Promise<ReadCollection<T, K, O, D>[]>;

  /**
   * Returns the newest document that matches `where`, or `undefined`.
   * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
   */
  findOne<K extends keyof Collections<T> & string, const O extends FindOptions<T, K>>(
    collection: K,
    options: Checked<O, Collections<T>, Collections<T>[K]["fields"], D>,
  ): Promise<ReadCollection<T, K, O, D> | undefined>;
  /** Returns one document, or `undefined`. */

  findById<
    K extends keyof Collections<T> & string,
    const O extends ReadOptions<Collections<T>, Collections<T>[K]["fields"]> = {},
  >(
    collection: K,
    id: string,
    options?: Checked<O, Collections<T>, Collections<T>[K]["fields"], D>,
  ): Promise<ReadCollection<T, K, O, D> | undefined>;

  /**
   * Creates a document. Throws a `ValidationError` for invalid `data`.
   * With `{ draft: true }`, creates it unpublished: only the drafts perspective reads it until `publish()`.
   */
  create<K extends keyof Collections<T> & string>(
    collection: K,
    data: Record<string, unknown>,
    options?: WriteOptions,
  ): Promise<CollectionDoc<T, K>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one.
   * Returns `undefined` if the document does not exist. Throws a `ValidationError` for invalid data.
   * With `{ draft: true }`, changes the draft and keeps the published data.
   */
  update<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    data: Record<string, unknown>,
    options?: WriteOptions,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Publishes the draft of a document, or its data again when it has none. Runs every check and hook of an
   * `update`. Throws a `ValidationError` for invalid data and keeps the draft. Returns `undefined` if the document
   * does not exist.
   */
  publish<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted, with
   * its `onDelete` effects, and the result is `undefined`.
   */
  discard<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /** Deletes a document and applies `onDelete` to every reference to it, in one transaction. */
  delete(collection: keyof Collections<T> & string, id: string): Promise<void>;

  /** Returns a global. Fields that were never saved are missing. */
  getGlobal<
    K extends keyof Globals<T> & string,
    const O extends ReadOptions<Collections<T>, Globals<T>[K]["fields"], false> = {},
  >(
    name: K,
    options?: Checked<O, Collections<T>, Globals<T>[K]["fields"], D, false>,
  ): Promise<ReadGlobal<T, K, O, D>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Throws a `ValidationError` for invalid data.
   * With `{ draft: true }`, changes the draft and keeps the published data.
   */
  setGlobal<K extends keyof Globals<T> & string>(
    name: K,
    data: Record<string, unknown>,
    options?: WriteOptions,
  ): Promise<GlobalData<T, K>>;

  /** Publishes the draft of a global, like `publish()`. */
  publishGlobal<K extends keyof Globals<T> & string>(name: K): Promise<GlobalData<T, K>>;

  /** Drops the draft of a global and returns the published one. */
  discardGlobal<K extends keyof Globals<T> & string>(name: K): Promise<GlobalData<T, K>>;

  /**
   * Returns a copy of this API whose reads use the drafts perspective: they see documents that were never published,
   * and pending drafts instead of the published data. Without it, reads see published documents only.
   * @example
   * await cms.withDrafts().find("posts")
   */
  withDrafts<S>(this: S): S;
};
