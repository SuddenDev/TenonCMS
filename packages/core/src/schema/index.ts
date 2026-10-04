import type { Nav } from "../admin/index.d.ts";
import type { Fields } from "./fields/index.ts";
import type { CollectionHooks, GlobalHooks, LocalApi } from "./hooks/index.ts";

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
  GlobalMeta,
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

/**
 * Where the live preview opens a document, relative to the site origin.
 * - A template with `{dot.path}` placeholders. A placeholder walks into groups and through one relation, whose
 *   target is read with `findById`. A value that is missing or empty means no preview.
 * - A function of the unsaved form state and the local API. `null` means no preview for this document.
 * @example
 * preview: '/posts/{slug}'
 * preview: '/{category.slug}/{slug}'
 * preview: (doc) => (doc.slug ? `/posts/${doc.slug}` : null)
 */
export type Preview =
  | string
  | ((
      doc: Record<string, unknown>,
      ctx: { cms: LocalApi },
    ) => string | null | Promise<string | null>);

export type Collection<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the collection key. */
  label?: string;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: string;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  fields: F;
  /** Field shown in the admin list view. Defaults to the first field. */
  titleField?: string;
  /** The page of a document in the admin's live preview. See {@link Preview}. */
  preview?: Preview;
  /** Functions that run on every read, write and delete of this collection. Typed only through `defineCollection()`. */
  hooks?: CollectionHooks<F>;
};

export type Global<F extends Fields = Fields> = {
  /** Name in the admin. Defaults to the global key. */
  label?: string;
  /** Short text under the name, e.g. on the Settings page and above the form. */
  description?: string;
  /** Placement in the admin navigation. Defaults to the sidebar. */
  nav?: Nav;
  fields: F;
  /** The page that shows this global in the admin's live preview, usually `'/'`. See {@link Preview}. */
  preview?: Preview;
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
