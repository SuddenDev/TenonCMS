import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import type { Modifiers } from "../../schema/index.ts";
import { type MediaCore, mediaOf } from "../runtime/create-media-core.ts";
import { hasVariants, isRaster } from "../images/decorate.ts";
import { variantKey, variantsOf } from "../variants/keys.ts";
import { removeOrphans } from "../variants/remove-orphans.ts";
import { renderAll } from "../variants/render-variants.ts";
import { THUMBNAIL } from "../variants/thumbnail.ts";
import { collectionTarget } from "../../content/targets.ts";
import { guardAll } from "../../access/rule.ts";

/**
 * `cms.media.regenerate()`: brings stored variants in line with the current image options. Deletes variants the options no
 * longer produce and, with `prerender`, renders missing ones. `force` re-renders every variant, or deletes them all without
 * `prerender`. Without `id`, runs for every file and deletes the variants of files that no longer exist.
 * Without `media.images`, a file keeps only its admin thumbnail, and `needsThumbnail` counts the files whose thumbnail
 * the admin should make: the missing ones, or every one with `force`.
 * Returns `undefined` for a missing document. Throws when the provider has no `render`, because nothing is stored.
 * `media.access.update` MUST allow without a `where`.
 */
export async function regenerate(core: Core, scope: Scope, id?: string, { force = false } = {}) {
  const media = mediaOf(core);
  const thumbnails = !media.images;
  if (media.images && !media.images.provider.render)
    throw new Error("tenoncms: regenerate needs an image provider with `render`");
  await guardAll(core, scope, collectionTarget("media"), "update");

  const docs = await findDocs(await databaseForScope(core, scope), "media", id ? { id } : {});
  if (id && !docs.length) return undefined;

  const total: { rendered: number; removed: number; needsThumbnail?: number } = {
    rendered: 0,
    removed: 0,
    ...(thumbnails && { needsThumbnail: 0 }),
  };
  for (const doc of docs) {
    if (thumbnails) {
      const { removed, needsThumbnail } = await regenerateThumbnail(media, doc, force);
      total.removed += removed;
      total.needsThumbnail! += needsThumbnail;
      continue;
    }
    const { rendered, removed } = await regenerateDoc(media, doc, force);
    total.rendered += rendered;
    total.removed += removed;
  }

  if (!id)
    total.removed += await removeOrphans(
      media.storage,
      docs.map((d) => d.key),
    );

  return total;
}

// Deletes every variant of one file except its thumbnail, and tells whether the admin should make the thumbnail.
async function regenerateThumbnail(media: MediaCore, doc: Record<string, any>, force: boolean) {
  const raster = isRaster(doc);
  const existing = await variantsOf(media.storage, doc.key);
  const stale = existing.filter((id) => !raster || id !== THUMBNAIL);
  for (const id of stale) await media.storage.delete(variantKey(doc.key, id));
  const needed = raster && (force || !existing.includes(THUMBNAIL));
  return { removed: stale.length, needsThumbnail: needed ? 1 : 0 };
}

// Deletes the variants of one file that the options no longer produce, then renders the missing ones.
async function regenerateDoc(media: MediaCore, doc: Record<string, any>, force: boolean) {
  const { images, storage, allowlist } = media;
  const prerendering = Boolean(images!.provider.prerender);
  const wanted = hasVariants(images!, doc) ? allowlist : new Map<string, Modifiers>();
  const existing = await variantsOf(storage, doc.key);

  // Without prerender, `force` deletes every variant. They render again on request.
  const stale = existing.filter((id) => !wanted.has(id) || (force && !prerendering));
  for (const id of stale) await storage.delete(variantKey(doc.key, id));

  const ids = [...wanted.keys()];
  const missing = force ? ids : ids.filter((id) => !existing.includes(id));
  const rendered = prerendering ? await renderAll(media, doc.key, missing) : 0;
  return { rendered, removed: stale.length };
}
