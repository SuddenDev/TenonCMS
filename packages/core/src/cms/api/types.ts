import type { ConflictOptions, DeleteOptions } from "../../errors.ts";
import type { EmailApi } from "../../email/types.ts";
import type {
  AppliedStructure,
  StructureCounts,
  SyncChoice,
} from "../../content/writes/sync-structure.ts";
import type {
  AlternatesOf,
  Checked,
  Data,
  Doc,
  FilterKey,
  GlobalLocaleMeta,
  LocaleMeta,
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
type FindOptions<T extends Schema, K extends keyof Collections<T>, L extends string> = ReadOptions<
  Collections<T>,
  Collections<T>[K]["fields"],
  true,
  L
> & {
  /**
   * Equality filters on field values, and on `createdBy` / `updatedBy` (user ids). `null` matches an empty or missing
   * field. `undefined` adds no filter.
   */
  where?: Partial<
    Record<
      FilterKey<Collections<T>[K]["fields"]> | "createdBy" | "updatedBy",
      string | number | boolean | null
    >
  >;
  /** Maximum number of documents. */
  limit?: number;
};
type ReadCollection<
  T extends Schema,
  K extends keyof Collections<T>,
  O,
  D extends number,
  L extends string,
> = ReadDoc<
  Collections<T>,
  Collections<T>[K]["fields"],
  PopulateOf<O, D>,
  SelectOf<O>,
  LocaleMeta<Collections<T>[K], L, SelectOf<O>, AlternatesOf<O>>
>;
type ReadGlobal<
  T extends Schema,
  K extends keyof Globals<T>,
  O,
  D extends number,
  L extends string,
> = Partial<Read<Collections<T>, Globals<T>[K]["fields"], PopulateOf<O, D>, SelectOf<O>>> &
  GlobalMeta<SelectOf<O>> &
  GlobalLocaleMeta<Globals<T>[K], L, SelectOf<O>>;

/** `locale` of a write, and of `publish()` and `discard()`. */
type LocaleOption<L extends string> = {
  /** The locale to write. Default: the default locale. Collections and globals that are not `localized` ignore it. */
  locale?: L;
};
/** Options of `discard()`: one locale's draft, or with `all` every draft of the document, shared fields included. */
type DiscardOptions<L extends string> =
  | (LocaleOption<L> & DeleteOptions)
  | {
      /** Drops the shared draft and the draft of every locale. A document or locale that was never published is deleted. Ignores `locale`. */
      all: true;
      allowBrokenLinks?: boolean;
    };

/**
 * The typed local API of `defineCms()`. `D` is the default populate depth, `L` the union of the configured locales
 * (`never` without `localization`).
 */
export type Api<T extends Schema, D extends number, L extends string = string> = {
  /** Server-side delivery with the configured adapter. Sends immediately. */
  email: EmailApi;
  /**
   * Lists documents of a collection, newest first.
   * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
   */
  find<K extends keyof Collections<T> & string, const O extends FindOptions<T, K, L> = {}>(
    collection: K,
    options?: Checked<O, Collections<T>, Collections<T>[K]["fields"], D, true, L>,
  ): Promise<ReadCollection<T, K, O, D, L>[]>;

  /**
   * Returns the newest document that matches `where`, or `undefined`.
   * In `where`, `null` matches documents where the field is empty or missing, and `undefined` adds no filter.
   */
  findOne<K extends keyof Collections<T> & string, const O extends FindOptions<T, K, L>>(
    collection: K,
    options: Checked<O, Collections<T>, Collections<T>[K]["fields"], D, true, L>,
  ): Promise<ReadCollection<T, K, O, D, L> | undefined>;
  /** Returns one document, or `undefined`. */

  findById<
    K extends keyof Collections<T> & string,
    const O extends ReadOptions<Collections<T>, Collections<T>[K]["fields"], true, L> = {},
  >(
    collection: K,
    id: string,
    options?: Checked<O, Collections<T>, Collections<T>[K]["fields"], D, true, L>,
  ): Promise<ReadCollection<T, K, O, D, L> | undefined>;

  /**
   * Returns the `alternates` of the document whose `permalink` is `url`, or `null` when no document has it, or
   * without `localization`. It reads the locale from the prefix of `url` (`routing`), or from `options.locale`.
   * Only a `permalink` template of top-level fields, like `/posts/{slug}`, can be matched; a function, a relation
   * hop or `{locale}` cannot. It costs one read per matching collection plus the `alternates` reads.
   * @example
   * await cms.alternatesAt("/de/posts/hallo") // { en: "/posts/hello", de: "/de/posts/hallo", "x-default": "/posts/hello" }
   */
  alternatesAt(url: string, options?: LocaleOption<L>): Promise<Record<string, string> | null>;

  /**
   * Creates a document. Throws a `ValidationError` for invalid `data`.
   * With `{ draft: true }`, creates it unpublished: only the drafts perspective reads it until `publish()`.
   */
  create<K extends keyof Collections<T> & string>(
    collection: K,
    data: Record<string, unknown>,
    options?: WriteOptions & LocaleOption<L>,
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
    options?: WriteOptions & LocaleOption<L> & ConflictOptions,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Publishes the draft of a document, or its data again when it has none. Runs every check and hook of an
   * `update`. Throws a `ValidationError` for invalid data and keeps the draft. Returns `undefined` if the document
   * does not exist.
   */
  publish<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    options?: LocaleOption<L> & ConflictOptions,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Drops the draft of a document and returns the published one. A document that was never published is deleted, with
   * its `onDelete` effects, and the result is `undefined`. In a localized collection it drops the draft of one locale;
   * the shared draft stays. `{ all: true }` drops every draft.
   */
  discard<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    options?: DiscardOptions<L>,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Fills the localized fields of `to` with those of `from`, as a draft (straight to the data with `drafts: false`).
   * It replaces the pending draft of `to`. `from` is read without fallback. Throws a `ValidationError` for an unknown
   * or equal locale, or when the collection is not localized. Returns `undefined` if the document does not exist.
   */
  copyLocale<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    locales: { from: L; to: L },
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Deletes the translation of one locale. Throws a `ValidationError` for the default locale and for the document's
   * last locale. Returns `undefined` if the document does not exist.
   */
  removeLocale<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    locale: L,
  ): Promise<CollectionDoc<T, K> | undefined>;

  /**
   * Sets whether a document uses one item structure in every locale. `true` makes the structure of `locale` (default: the
   * default locale) the shared one, `false` gives each locale its own again, and `"default"` follows the collection.
   * It is a draft when the collection has drafts. Throws a `ValidationError` for a collection without a localized
   * group, array or blocks field. Returns `undefined` if the document does not exist.
   */
  setSyncStructure<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    sync: SyncChoice,
    options?: { locale?: L; dryRun?: false },
  ): Promise<CollectionDoc<T, K> | undefined>;
  /** Writes nothing. Returns per locale with a row the items that disappear and the items that show fallback values. */
  setSyncStructure<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    sync: SyncChoice,
    options: { locale?: L; dryRun: true },
  ): Promise<StructureCounts>;

  /**
   * Makes every document of a collection follow it, with the default locale's structure where that turns sharing on. Needs
   * `update` on every document: one denied document fails the whole call with no writes. `dryRun` writes nothing and
   * returns the counts per locale.
   */
  applySyncStructure(
    collection: keyof Collections<T> & string,
    options?: { dryRun?: boolean },
  ): Promise<AppliedStructure>;

  /** Deletes a document and applies `onDelete` to every reference to it, in one transaction. */
  delete(
    collection: keyof Collections<T> & string,
    id: string,
    options?: DeleteOptions,
  ): Promise<void>;

  /** Returns a global. Fields that were never saved are missing. */
  getGlobal<
    K extends keyof Globals<T> & string,
    const O extends ReadOptions<Collections<T>, Globals<T>[K]["fields"], false, L> = {},
  >(
    name: K,
    options?: Checked<O, Collections<T>, Globals<T>[K]["fields"], D, false, L>,
  ): Promise<ReadGlobal<T, K, O, D, L>>;

  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Throws a `ValidationError` for invalid data.
   * With `{ draft: true }`, changes the draft and keeps the published data.
   */
  setGlobal<K extends keyof Globals<T> & string>(
    name: K,
    data: Record<string, unknown>,
    options?: WriteOptions & LocaleOption<L> & ConflictOptions,
  ): Promise<GlobalData<T, K> & GlobalMeta>;

  /** Publishes the draft of a global, like `publish()`. */
  publishGlobal<K extends keyof Globals<T> & string>(
    name: K,
    options?: LocaleOption<L> & ConflictOptions,
  ): Promise<GlobalData<T, K> & GlobalMeta>;

  /** Drops the draft of a global and returns the published one. Like {@link Api.discard}, it takes `locale` or `{ all: true }`. */
  discardGlobal<K extends keyof Globals<T> & string>(
    name: K,
    options?: DiscardOptions<L>,
  ): Promise<GlobalData<T, K>>;

  /** Fills the localized fields of `to` with those of `from`, like {@link Api.copyLocale}. */
  copyGlobalLocale<K extends keyof Globals<T> & string>(
    name: K,
    locales: { from: L; to: L },
  ): Promise<GlobalData<T, K>>;

  /** Deletes the translation of one locale, like {@link Api.removeLocale}. */
  removeGlobalLocale<K extends keyof Globals<T> & string>(
    name: K,
    locale: L,
  ): Promise<GlobalData<T, K>>;

  /** Sets whether a global uses one item structure in every locale, like {@link Api.setSyncStructure}. */
  setGlobalSyncStructure<K extends keyof Globals<T> & string>(
    name: K,
    sync: SyncChoice,
    options?: { locale?: L; dryRun?: false },
  ): Promise<GlobalData<T, K>>;
  setGlobalSyncStructure<K extends keyof Globals<T> & string>(
    name: K,
    sync: SyncChoice,
    options: { locale?: L; dryRun: true },
  ): Promise<StructureCounts>;

  /**
   * Returns a copy of this API whose reads use the drafts perspective: they see documents that were never published,
   * and pending drafts instead of the published data. Without it, reads see published documents only.
   * @example
   * await cms.withDrafts().find("posts")
   */
  withDrafts<S>(this: S): S;
};
