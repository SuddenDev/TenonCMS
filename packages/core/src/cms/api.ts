import type {
  Checked,
  Data,
  Doc,
  FilterKey,
  LocalApi,
  PopulateOf,
  Read,
  ReadDoc,
  ReadOptions,
  Schema,
  SelectOf,
} from "../schema/index.ts";
import { mediaApi } from "../media/index.ts";
import { read, readGlobal } from "./read.ts";
import { run } from "./run.ts";
import { ValidationError } from "../errors.ts";
import { col, type Core, glob, known, type Scope } from "./scope.ts";
import { remove, setGlobal, update, write } from "./write.ts";

// Media documents change only through `cms.media`.
function writable(core: Core, collection: string) {
  known(core, "collection", collection);
  if (collection === "media")
    throw new ValidationError({ "": "Media documents change only through the media API" });
}

/** The local API of one scope. The implementation is untyped; `Api` types it for the host. */
export function bind(core: Core, scope: Scope): LocalApi {
  return {
    async find(collection, options = {}) {
      known(core, "collection", collection);
      return run(core, scope, "read", col(collection), { collection, options }, (s, args) =>
        read(core, s, collection, args.options),
      );
    },
    async findOne(collection, options) {
      known(core, "collection", collection);
      return run(
        core,
        scope,
        "read",
        col(collection),
        { collection, options },
        async (s, args) => (await read(core, s, collection, { ...args.options, limit: 1 }))[0],
      );
    },
    async findById(collection, id, options = {}) {
      known(core, "collection", collection);
      return run(
        core,
        scope,
        "read",
        col(collection),
        { collection, id, options },
        async (s, args) => (await read(core, s, collection, { ...args.options, id: args.id }))[0],
      );
    },
    async create(collection, data) {
      writable(core, collection);
      const doc = await run(
        core,
        scope,
        "create",
        col(collection),
        { collection, data },
        (s, args) => write(core, s, col(collection), "create", args.data),
      );
      return doc!;
    },
    async update(collection, id, data) {
      writable(core, collection);
      return update(core, scope, collection, id, data);
    },
    async delete(collection, id) {
      writable(core, collection);
      await run(core, scope, "delete", col(collection), { collection, id }, (s, args) =>
        remove(core, s, collection, args.id),
      );
    },
    async getGlobal(name, options = {}) {
      known(core, "global", name);
      return run(core, scope, "getGlobal", glob(name), { global: name, options }, (s, args) =>
        readGlobal(core, s, name, args.options),
      );
    },
    async setGlobal(name, data) {
      known(core, "global", name);
      return (await setGlobal(core, scope, name, data))!;
    },
    media: core.media && mediaApi(core, scope),
  };
}

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
>;

/** The typed local API of `defineCms()`. `D` is the default populate depth. */
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
  /** Creates a document. Throws a `ValidationError` for invalid `data`. */
  create<K extends keyof Collections<T> & string>(
    collection: K,
    data: Record<string, unknown>,
  ): Promise<CollectionDoc<T, K>>;
  /**
   * Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one.
   * Returns `undefined` if the document does not exist. Throws a `ValidationError` for invalid data.
   */
  update<K extends keyof Collections<T> & string>(
    collection: K,
    id: string,
    data: Record<string, unknown>,
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
  /** Changes the top-level fields in `data`. Fields left out keep their stored values; `null` clears one. Throws a `ValidationError` for invalid data. */
  setGlobal<K extends keyof Globals<T> & string>(
    name: K,
    data: Record<string, unknown>,
  ): Promise<GlobalData<T, K>>;
};
