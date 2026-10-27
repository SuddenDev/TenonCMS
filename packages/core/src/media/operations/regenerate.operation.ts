import type { Core, Scope } from "../../cms/runtime/types.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import type { Modifiers } from "../../schema/index.ts";
import { type MediaCore, mediaOf } from "../runtime/create-media-core.ts";
import { hasVariants } from "../images/decorate.ts";
import { variantKey, variantsOf } from "../variants/keys.ts";
import { removeOrphans } from "../variants/remove-orphans.ts";
import { renderAll } from "../variants/render-variants.ts";
import { collectionTarget } from "../../content/targets.ts";
import { guardAll } from "../../access/rule.ts";

/**
 * `cms.media.regenerate()`: brings stored variants in line with the current image options. Deletes variants the options no
 * longer produce and, with `prerender`, renders missing ones. `force` re-renders every variant, or deletes them all without
 * `prerender`. Without `id`, runs for every file and deletes the variants of files that no longer exist.
 * Returns `undefined` for a missing document. Throws when the provider has no `render`, because nothing is stored.
 * `media.access.update` MUST allow without a `where`.
 */
export async function regenerate(core: Core, scope: Scope, id?: string, { force = false } = {}) {
  const media = mediaOf(core);
  if (!media.images?.provider.render)
    throw new Error("integral-cms: regenerate needs an image provider with `render`");
  await guardAll(core, scope, collectionTarget("media"), "update");

  const docs = await findDocs(await databaseForScope(core, scope), "media", id ? { id } : {});
  if (id && !docs.length) return undefined;

  const total = { rendered: 0, removed: 0 };
  for (const doc of docs) {
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
