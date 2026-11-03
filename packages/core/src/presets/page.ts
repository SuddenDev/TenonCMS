// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { BlocksField, Collection, CollectionHooks, Fields } from "../schema/index.ts";
import { nestedPaths } from "./nested-paths.ts";
import { seo } from "./seo.ts";

/**
 * Pages with nested URLs. Spread `fields` into a collection's fields and use `hooks` stage by stage. `permalink` is the
 * URL of a page, its `path`. `parent` and `path` are hidden: the slug field picks the parent and shows its path.
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
        hidden: true,
      },
      path: { type: "text", readOnly: true, hidden: true },
    },
    hooks: nestedPaths(),
    permalink: "{path}",
  } as const satisfies { fields: Fields; hooks: object; permalink: string };
}

type PagesPresetOptions<N, F, S, B> = Omit<Collection, "fields" | "hooks"> & {
  /** The collection name. Default `'pages'`. */
  name?: N;
  /**
   * Adds the `seo()` group. It has an `image` field, so it needs media. The collection then gets the tabs `content`
   * and `seo`. Fields without a `tab` go to `content`. Default `false`.
   */
  seo?: S;
  /** Adds a `content` blocks field with these blocks (the `blocks` of a `blocks` field), after the page fields. */
  blocks?: B;
  /** More fields, after the page fields. A key of the preset replaces its field. */
  fields?: F;
  /** More hooks. Each stage merges with the preset's, and a hook named like one of the preset's replaces it. */
  hooks?: CollectionHooks<Fields>;
};

/**
 * A pages collection for `defineCms({ presets })`: `page()` with its hooks and `permalink`, a `title` title field,
 * optional `content` blocks and optional SEO fields. Other collection options pass through. A host `tabs` merges over
 * the preset's.
 */
export function pagesPreset<
  const N extends string = "pages",
  const F extends Fields = {},
  const S extends boolean = false,
  const B extends BlocksField["blocks"] | undefined = undefined,
  const T extends PagesPresetOptions<N, F, S, B> = {},
>(options: T & PagesPresetOptions<N, F, S, B> = {} as T) {
  const { name = "pages", seo: withSeo, blocks, fields, hooks = {}, tabs, ...collection } = options;
  const base = page({ collection: name });
  const merged: Record<string, object> = { ...base.hooks };
  for (const [stage, slot] of Object.entries(hooks)) merged[stage] = { ...merged[stage], ...slot };

  type Pages = Omit<T, "name" | "seo" | "blocks" | "fields" | "hooks"> & {
    fields: ReturnType<typeof page<N>>["fields"] &
      ([B] extends [undefined] ? {} : { content: { type: "blocks"; blocks: B } }) &
      (S extends true ? ReturnType<typeof seo>["fields"] : {}) &
      F;
  };
  const content: Fields = blocks
    ? { content: { type: "blocks", label: { en: "Content", de: "Inhalt" }, blocks } }
    : {};
  const all: Fields = { ...base.fields, ...content };
  // The SEO tab names the group, so it needs no box of its own.
  const seoFields: Fields = withSeo ? { seo: { ...seo().fields.seo, appearance: "plain" } } : {};
  return {
    collections: {
      [name]: {
        label: { en: "Pages", de: "Seiten" },
        titleField: "title",
        permalink: base.permalink,
        ...collection,
        ...(withSeo && { tabs: { ...pageTabs, ...tabs } }),
        fields: withSeo
          ? {
              ...inTab(all, "content"),
              ...inTab(seoFields, "seo"),
              ...inTab(fields ?? {}, "content"),
            }
          : { ...all, ...seoFields, ...fields },
        hooks: merged,
      },
    } as unknown as { [K in NoInfer<N>]: Pages },
  };
}

const pageTabs = {
  content: { label: { en: "Content", de: "Inhalt" }, icon: "file-text" },
  seo: { label: "SEO", icon: "search" },
} as const;

// A field with its own `tab` keeps it.
function inTab(fields: Fields, tab: string): Fields {
  return Object.fromEntries(Object.entries(fields).map(([key, f]) => [key, { tab, ...f }]));
}
