import type { Fields } from "./fields/index.ts";
import type { CollectionHooks, GlobalHooks } from "./hooks/index.ts";

export type * from "./fields/index.ts";
export type * from "./hooks/index.ts";
export type {
  Checked,
  CheckRefs,
  Data,
  Doc,
  Exact,
  File,
  FilterKey,
  Image,
  Populate,
  PopulateArg,
  PopulateOf,
  Read,
  ReadDoc,
  ReadOptions,
  Resolve,
  Select,
  SelectArg,
  SelectOf,
} from "./types.ts";

export type Collection<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the collection key. */
  label?: string;
  fields: F;
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string;
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>;
};

export type Global<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the global key. */
  label?: string;
  fields: F;
  /** Functions that run on every read and write of this global. Typed only through `defineGlobal()`. */
  hooks?: GlobalHooks<F>;
};

export type Schema = {
  collections?: Record<string, Collection>;
  globals?: Record<string, Global>;
};

// `H` keeps the literal hooks, so a host can leave one hook of a record out by name.
export function defineCollection<
  const F extends Fields,
  const T extends Omit<Collection<F>, "fields" | "hooks">,
  const H extends CollectionHooks<NoInfer<F>>,
>(collection: T & { fields: F; hooks?: H }): T & { fields: F; hooks: H } {
  return { ...collection, hooks: collection.hooks ?? ({} as H) };
}

export function defineGlobal<
  const F extends Fields,
  const T extends Omit<Global<F>, "fields" | "hooks">,
  const H extends GlobalHooks<NoInfer<F>>,
>(global: T & { fields: F; hooks?: H }): T & { fields: F; hooks: H } {
  return { ...global, hooks: global.hooks ?? ({} as H) };
}
