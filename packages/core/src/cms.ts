import type { User } from "better-auth";
import { consola } from "consola";
import type { Kysely } from "kysely";
import { createApp } from "./app.ts";
import { type AuthOptions, authOptions, createAuth } from "./auth.ts";
import { isObject } from "./condition.ts";
import {
  deleteDoc,
  findDocs,
  insertDoc,
  loadDoc,
  loadGlobal,
  saveGlobal,
  updateDoc,
} from "./db/documents.ts";
import { createDb, type Database, migrate } from "./db/index.ts";
import { ConflictError, ValidationError } from "./errors.ts";
import { list, runHooks } from "./hooks/run.ts";
import {
  type CmsOptions,
  type DefaultDepth,
  type PluginCollections,
  type PluginGlobals,
  type PopulateConfig,
} from "./options.ts";
import { mergePlugins, type Plugin } from "./plugin.ts";
import { badSelectPath, pick, populate, type SelectSpec, type Spec, toSpec } from "./populate.ts";
import { checkRefs, checkUnique, onDelete } from "./refs.ts";
import type {
  Checked,
  Collection,
  Data,
  Doc,
  Fields,
  FilterKey,
  Global,
  LocalApi,
  Operation,
  PopulateOf,
  Read,
  ReadDoc,
  ReadOptions,
  RootHooks,
  Schema,
  SelectOf,
} from "./schema.ts";
import { checkSchema, parseData } from "./validate.ts";
import { applyDefaults, fieldHooks, fillSlugs, filterable, runValidate } from "./walk.ts";

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

/** The target of an operation. Hooks get it as `collection` or `global`. */
type Name = { kind: "collection" | "global"; name: string };
const col = (name: string): Name => ({ kind: "collection", name });
const glob = (name: string): Name => ({ kind: "global", name });
type Stage = keyof RootHooks;

/** One call of the local API. Calls from inside a hook share `trx`, `user` and `context`. */
type Scope = {
  trx?: Kysely<Database>;
  user: User | null;
  context: Record<string, unknown>;
  // True inside a hook: the call keeps `context` and runs no `afterError` of its own.
  nested: boolean;
};
type Inner = Scope & { cms: LocalApi };

type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

// The stored data of a document, without `id`, `createdAt` and `updatedAt`.
const stripMeta = ({ id, createdAt, updatedAt, ...data }: Record<string, unknown>) => data;

/**
 * Creates a CMS instance. Export it as the default export of `integral.config.ts`.
 *
 * The returned object is the local API for server code. Nothing connects until the first call.
 */
export function defineCms<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
  const A extends AuthOptions = {},
  const P extends PopulateConfig = {},
  const PL extends readonly Plugin[] = [],
>({
  database,
  secret,
  auth: host = {} as A,
  populate: config = {} as P,
  hooks: rootHooks = {},
  plugins = [] as unknown as PL,
  ...own
}: CmsOptions<C, G, A, P, PL>) {
  type T = { collections?: C & PluginCollections<PL>; globals?: G & PluginGlobals<PL> };
  type D = DefaultDepth<P>;
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 };
  const schema = mergePlugins(plugins, own);
  checkSchema(schema, defaults);
  const { collections, globals } = schema;
  const count = (o: object) => Object.keys(o).length;
  consola
    .withTag("integral")
    .info(`Initialized with ${count(collections)} collection(s), ${count(globals)} global(s)`);

  // Created lazily so no connection opens at import time.
  let ready:
    | Promise<{ db: ReturnType<typeof createDb>; options: ReturnType<typeof authOptions<A>> }>
    | undefined;
  const connect = () =>
    (ready ??= (async () => {
      const db = createDb(database.url, database.authToken);
      const options = authOptions(db, secret, host);
      await migrate(db, options);
      return { db, options };
    })());
  const db = async () => (await connect()).db;
  // The transaction of the scope, or a plain connection.
  const q = async (s: Scope) => s.trx ?? (await db());

  let authInstance: ReturnType<typeof createAuth<ReturnType<typeof authOptions<A>>>> | undefined;
  const auth = async () => {
    if (!secret || secret.length < 32)
      throw new Error("integral-cms: `secret` MUST be at least 32 characters");
    return (authInstance ??= createAuth((await connect()).options));
  };

  // The fields and hooks of a collection or global.
  const target = ({ kind, name }: Name) =>
    kind === "collection" ? collections[name] : globals[name];
  // The hooks of a stage: the collection's or global's, then the plugins', then the host's root hooks.
  const slot = (name: Name, stage: Stage): ((args: any) => unknown)[] => [
    ...list<(args: any) => unknown>((target(name).hooks as RootHooks | undefined)?.[stage]),
    ...plugins.flatMap((p) => list<(args: any) => unknown>(p.hooks?.[stage])),
    ...list<(args: any) => unknown>(rootHooks[stage]),
  ];
  // The arguments every hook gets, plus `extra`.
  const hookArgs = <E extends object>(s: Inner, name: Name, extra: E) => ({
    cms: s.cms,
    user: s.user,
    context: s.context,
    [name.kind]: name.name,
    ...extra,
  });
  const known = (kind: "collection" | "global", name: string) => {
    const owners = kind === "collection" ? collections : globals;
    if (!Object.hasOwn(owners, name)) throw new Error(`Unknown ${kind} "${name}"`);
  };

  // A scope for hooks and nested calls: shares `trx` and `context`, and gets its own bound API.
  const inner = (scope: Scope, trx: Scope["trx"], context: Scope["context"]): Inner => {
    const s: Scope = { ...scope, trx, context, nested: true };
    return { ...s, cms: bind(s) };
  };

  // Runs the `afterError` hooks. An error in one MUST NOT replace the original.
  async function afterError(s: Inner, name: Name, operation: Operation, error: unknown) {
    const args = hookArgs(s, name, { operation, error });
    for (const fn of slot(name, "afterError")) {
      try {
        await fn(args);
      } catch (e) {
        consola.withTag("integral").error(e);
      }
    }
  }

  // Every local API call goes through here. Collection calls run `beforeOperation` and `afterOperation`.
  // Writes run in one transaction with their hooks and nested calls. Reads open none.
  async function run<R>(
    scope: Scope,
    operation: Operation,
    name: Name,
    args: Record<string, any>,
    fn: (s: Inner, args: Record<string, any>) => Promise<R>,
  ): Promise<R> {
    const context = scope.nested ? scope.context : {};
    // Globals have no `beforeOperation` and `afterOperation`, root ones included.
    const of = (stage: Stage) => (name.kind === "collection" ? slot(name, stage) : undefined);
    const body = async (trx = scope.trx) => {
      const s = inner(scope, trx, context);
      const base = hookArgs(s, name, { operation });
      const input = await runHooks(of("beforeOperation"), "args", args, base);
      const result = await fn(s, input);
      return runHooks(of("afterOperation"), "result", result, { ...base, args: input });
    };
    const inTransaction = operation !== "read" && operation !== "getGlobal" && !scope.trx;
    try {
      if (!inTransaction) return await body();
      return await (await db()).transaction().execute((trx) => body(trx));
    } catch (error) {
      // Only the outermost call runs `afterError`, after the rollback. 400 and 409 are expected and run none.
      const expected = error instanceof ValidationError || error instanceof ConflictError;
      if (!scope.nested && !expected)
        await afterError(inner(scope, undefined, context), name, operation, error);
      throw error;
    }
  }

  // `effect`: an `onDelete` effect. It skips id checks, because other relations of the document MAY point to
  // documents that the same delete removes.
  const update = (scope: Scope, collection: string, id: string, data: unknown, effect = false) =>
    run(scope, "update", col(collection), { collection, id, data }, (s, args) =>
      write(s, col(collection), "update", args.data, { id: args.id, effect }),
    );
  const setGlobal = (scope: Scope, name: string, data: unknown, effect = false) =>
    run(scope, "setGlobal", glob(name), { global: name, data }, (s, args) =>
      write(s, glob(name), "setGlobal", args.data, { effect }),
    );

  // Shared by `create`, `update` and `setGlobal`. Returns `undefined` for a missing document.
  async function write(
    s: Inner,
    name: Name,
    operation: "create" | "update" | "setGlobal",
    input: unknown,
    { id, effect }: { id?: string; effect?: boolean } = {},
  ) {
    const { fields } = target(name);
    const db = await q(s);
    const originalDoc =
      name.kind === "global"
        ? await loadGlobal(db, name.name)
        : id
          ? await loadDoc(db, name.name, id)
          : undefined;
    if (id && !originalDoc) return undefined;
    const args = hookArgs(s, name, { operation, id, originalDoc });
    const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

    // `update` and `setGlobal` change only the top-level keys they get. The others keep their stored values.
    const copy =
      originalDoc && isObject(input)
        ? { ...stripMeta(originalDoc), ...structuredClone(input) }
        : structuredClone(input);
    if (isObject(copy)) {
      if (operation === "create") await applyDefaults(fields, copy, args);
      await fillSlugs(fields, copy);
      await fieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
    }
    const valid = parseData(
      fields,
      await runHooks(slot(name, "beforeValidate"), "data", copy, args),
    );

    // `onDelete` effects only clear references, so the document's own rules do not apply.
    if (!effect) {
      const errors = await runValidate(fields, valid, fieldArgs(valid));
      if (Object.keys(errors).length) throw new ValidationError(errors);
    }
    await fieldHooks("beforeChange", fields, valid, fieldArgs(valid));
    // Validated again, so a hook cannot store invalid data.
    const data = parseData(fields, await runHooks(slot(name, "beforeChange"), "data", valid, args));
    if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id);
    if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

    let stored: Record<string, any>;
    if (name.kind === "global") {
      await saveGlobal(db, name.name, data);
      stored = data;
    } else if (id) stored = await updateDoc(db, name.name, id, data);
    else stored = await insertDoc(db, name.name, data);

    await fieldHooks("afterChange", fields, stored, fieldArgs(stored));
    const doc = await runHooks(
      slot(name, "afterChange"),
      "doc",
      stored,
      hookArgs(s, name, { operation, previousDoc: originalDoc }),
    );
    return (await afterRead(s, name, [doc], operation))[0];
  }

  // `beforeRead` on the loaded documents, then relations, then `afterRead`, then `select`.
  async function readDocs(
    s: Inner,
    name: Name,
    docs: Record<string, any>[],
    spec: Spec,
    select: SelectSpec | undefined,
  ) {
    const { fields } = target(name);
    const operation = name.kind === "collection" ? "read" : "getGlobal";
    const before = await beforeRead(s, name, docs, operation);
    await populate(await q(s), collections, fields, before, spec, {
      // Populated documents run their own collection's read hooks, in the scope of the outer read.
      before: (collection, docs) => beforeRead(s, col(collection), docs, "read"),
      after: (collection, docs) => afterRead(s, col(collection), docs, "read"),
    });
    const result = await afterRead(s, name, before, operation);
    return select ? result.map((d) => pick(collections, fields, d, select)) : result;
  }

  const beforeRead = (s: Inner, name: Name, docs: Record<string, any>[], operation: Operation) =>
    runHooks(slot(name, "beforeRead"), "docs", docs, hookArgs(s, name, { operation }));

  // Field `afterRead` per document, then the collection's or global's once for the batch.
  async function afterRead(
    s: Inner,
    name: Name,
    docs: Record<string, any>[],
    operation: Operation,
  ) {
    const { fields } = target(name);
    for (const doc of docs)
      await fieldHooks("afterRead", fields, doc, hookArgs(s, name, { operation, data: doc }));
    return runHooks(slot(name, "afterRead"), "docs", docs, hookArgs(s, name, { operation }));
  }

  // The populate spec and the checked `select` of read options. Throws for a `select` that does not fit
  // the fields or what `populate` resolves. `doc`: false for globals, which have no meta keys.
  function readSpec(fields: Fields, options: ReadOpts, doc = true) {
    const spec = toSpec(options, defaults.depth);
    const select = options.select as SelectSpec | undefined;
    const error = select && badSelectPath(collections, fields, select, spec, "", doc);
    if (error) throw new Error(`Invalid select: ${error}`);
    return { spec, select };
  }

  // `find`, `findOne` and `findById`.
  async function read(s: Inner, collection: string, options: ReadOpts) {
    const { fields } = collections[collection];
    const { spec, select } = readSpec(fields, options);
    for (const key of Object.keys(options.where ?? {})) {
      if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`);
      if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`);
    }
    const docs = await findDocs(await q(s), collection, options);
    return readDocs(s, col(collection), docs, spec, select);
  }

  // The local API of one scope. The implementation is untyped; `Api` types it for the host.
  function bind(scope: Scope): LocalApi {
    return {
      async find(collection, options = {}) {
        known("collection", collection);
        return run(scope, "read", col(collection), { collection, options }, (s, args) =>
          read(s, collection, args.options),
        );
      },
      async findOne(collection, options) {
        known("collection", collection);
        return run(
          scope,
          "read",
          col(collection),
          { collection, options },
          async (s, args) => (await read(s, collection, { ...args.options, limit: 1 }))[0],
        );
      },
      async findById(collection, id, options = {}) {
        known("collection", collection);
        return run(
          scope,
          "read",
          col(collection),
          { collection, id, options },
          async (s, args) => (await read(s, collection, { ...args.options, id: args.id }))[0],
        );
      },
      async create(collection, data) {
        known("collection", collection);
        const doc = await run(scope, "create", col(collection), { collection, data }, (s, args) =>
          write(s, col(collection), "create", args.data),
        );
        return doc!;
      },
      async update(collection, id, data) {
        known("collection", collection);
        return update(scope, collection, id, data);
      },
      async delete(collection, id) {
        known("collection", collection);
        await run(scope, "delete", col(collection), { collection, id }, async (s, args) => {
          const db = await q(s);
          const doc = await loadDoc(db, collection, args.id);
          if (!doc) return;
          const base = hookArgs(s, col(collection), { id: args.id, doc });
          await runHooks(slot(col(collection), "beforeDelete"), "doc", doc, base);
          await deleteDoc(db, collection, args.id);
          await onDelete(db, schema, collection, args.id, {
            update: (collection, id, data) => update(s, collection, id, data, true),
            setGlobal: (name, data) => setGlobal(s, name, data, true),
            delete: (collection, id) => s.cms.delete(collection, id),
          });
          await runHooks(slot(col(collection), "afterDelete"), "doc", doc, base);
        });
      },
      async getGlobal(name, options = {}) {
        known("global", name);
        return run(scope, "getGlobal", glob(name), { global: name, options }, async (s, args) => {
          const { spec, select } = readSpec(globals[name].fields, args.options, false);
          const data = (await loadGlobal(await q(s), name)) ?? {};
          return (await readDocs(s, glob(name), [data], spec, select))[0];
        });
      },
      async setGlobal(name, data) {
        known("global", name);
        return (await setGlobal(scope, name, data))!;
      },
    };
  }

  const api = (user: User | null) =>
    bind({ user, context: {}, nested: false }) as unknown as Api<T, D>;
  const cms = {
    schema: schema as unknown as T,
    auth,
    /** The `populate` config with defaults. */
    populate: defaults as { depth: D; maxDepth: number },
    ...api(null),

    /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>;
    },
  };

  const app = createApp(
    cms as unknown as Cms<Schema>,
    (user) => ({ ...cms, ...api(user) }) as unknown as Cms<Schema>,
    plugins,
  );
  return cms;
}

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

export type Cms<T extends Schema> = ReturnType<
  typeof defineCms<NonNullable<T["collections"]>, NonNullable<T["globals"]>>
>;
