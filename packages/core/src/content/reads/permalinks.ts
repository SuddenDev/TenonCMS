import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { permalinkUrl } from "../../preview/server/resolve-url.ts";

/**
 * Adds `permalink` to documents: the public URL in the read's locale, with the locale prefix of `routing`. `null` when
 * the collection has no `permalink` or the template cannot be filled. A template with a relation hop costs one read
 * per document.
 */
export async function addPermalinks(
  core: Core,
  s: Inner,
  collection: string,
  docs: Record<string, any>[],
) {
  const entry = core.schema.collections[collection];
  const where = { locale: s.locale, localization: core.localization };

  return Promise.all(
    docs.map(async (doc) => ({
      ...doc,
      permalink: entry.permalink ? await permalinkUrl(entry, doc, s.cms, where) : null,
    })),
  );
}
