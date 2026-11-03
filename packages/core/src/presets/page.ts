// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Collection, CollectionHooks, Fields } from "../schema/index.ts";
import { nestedPaths } from "./nested-paths.ts";
import { seo } from "./seo.ts";

/**
 * Pages with nested URLs. Spread `fields` into a collection's fields and use `hooks` stage by stage. `permalink` is the
 * URL of a page, its `path`.
 * @param options.collection The collection the pages live in, which `parent` points to. Default `'pages'`.
 */
export function page<const C extends string = "pages">(options: { collection?: C } = {}) {
  return {
    fields: {
      title: { type: "text", required: true },
      slug: { type: "slug", from: "title", parent: "parent", path: "path", required: true },
      // `restrict`: a page with children cannot be deleted, so no subtree is lost.
      parent: {
        type: "relation",
        collection: (options.collection ?? "pages") as C,
        onDelete: "restrict",
      },
      path: { type: "text", readOnly: true },
    },
    hooks: nestedPaths(),
    permalink: "{path}",
  } as const satisfies { fields: Fields; hooks: object; permalink: string };
}

type PagesPresetOptions<N, F, S> = Omit<Collection, "fields" | "hooks"> & {
  /** The collection name. Default `'pages'`. */
  name?: N;
  /** Adds the `seo()` group. It has an `image` field, so it needs media. Default `false`. */
  seo?: S;
  /** More fields, after the page fields. A key of the preset replaces its field. */
  fields?: F;
  /** More hooks. Each stage merges with the preset's, and a hook named like one of the preset's replaces it. */
  hooks?: CollectionHooks<Fields>;
};

/**
 * A pages collection for `defineCms({ presets })`: `page()` with its hooks and `permalink`, a `title` title field and
 * optional SEO fields. Other collection options pass through.
 */
export function pagesPreset<
  const N extends string = "pages",
  const F extends Fields = {},
  const S extends boolean = false,
  const T extends PagesPresetOptions<N, F, S> = {},
>(options: T & PagesPresetOptions<N, F, S> = {} as T) {
  const { name = "pages", seo: withSeo, fields, hooks = {}, ...collection } = options;
  const base = page({ collection: name });
  const merged: Record<string, object> = { ...base.hooks };
  for (const [stage, slot] of Object.entries(hooks)) merged[stage] = { ...merged[stage], ...slot };

  type Pages = Omit<T, "name" | "seo" | "fields" | "hooks"> & {
    fields: ReturnType<typeof page<N>>["fields"] &
      (S extends true ? ReturnType<typeof seo>["fields"] : {}) &
      F;
  };
  return {
    collections: {
      [name]: {
        label: { en: "Pages", de: "Seiten" },
        titleField: "title",
        permalink: base.permalink,
        ...collection,
        fields: { ...base.fields, ...(withSeo && seo().fields), ...fields },
        hooks: merged,
      },
    } as unknown as { [K in NoInfer<N>]: Pages },
  };
}
