import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";
import { ForbiddenError } from "../errors.ts";
import type { SitemapEntry } from "../helpers/sitemap-xml.ts";
import { isSiteNoindex, siteUrl } from "./site.ts";

type Row = Record<string, any>;

/**
 * The sitemap: every published document a visitor MAY read in a collection with a `permalink`, one entry per locale
 * with its alternates, then the host's `sitemap.entries`. Leaves out documents with `seo.noindex` and collections
 * with `sitemap: false`. Empty with `sitemap: false` or while the `seo` settings say `noindex`.
 * @returns The entries, absolute against {@link siteUrl}, or as given without a site URL.
 */
export async function sitemapEntries(
  core: Core,
  { site, origin }: { site?: string; origin?: string } = {},
) {
  if (!core.sitemap || (await isSiteNoindex(core))) return [];
  const cms = core.localApi(outerScope({ user: null, perspective: "published" }));

  const generated: SitemapEntry[] = [];
  for (const [name, entry] of Object.entries(core.schema.collections)) {
    if (!entry.permalink || entry.sitemap === false) continue;
    // ponytail: one read of every document, split into sitemap index files past 50,000 URLs.
    const docs = await readable(
      cms.find(name, { populate: false, permalink: true, alternates: true }),
    );
    generated.push(...docs.filter((doc) => doc.seo?.noindex !== true).flatMap(documentEntries));
  }

  const entries = core.sitemap.entries
    ? await core.sitemap.entries({ cms, entries: generated })
    : generated;
  const base = await siteUrl(core, site, origin);
  return base ? entries.map((e) => absolute(e, base)) : entries;
}

// A collection whose read rule denies visitors adds nothing.
async function readable(read: Promise<Row[]>) {
  try {
    return await read;
  } catch (error) {
    if (error instanceof ForbiddenError) return [];
    throw error;
  }
}

function documentEntries(doc: Row): SitemapEntry[] {
  const lastmod = doc.updatedAt as string | undefined;
  const alternates = doc.alternates as Record<string, string> | undefined;
  const urls = Object.entries(alternates ?? {}).filter(([locale]) => locale !== "x-default");

  if (urls.length) return urls.map(([, url]) => ({ url, lastmod, alternates }));
  return doc.permalink ? [{ url: doc.permalink, lastmod }] : [];
}

function absolute({ url, alternates, ...entry }: SitemapEntry, base: string): SitemapEntry {
  const resolve = (u: string) => new URL(u, base).href;
  return {
    ...entry,
    url: resolve(url),
    ...(alternates && {
      alternates: Object.fromEntries(Object.entries(alternates).map(([l, u]) => [l, resolve(u)])),
    }),
  };
}
