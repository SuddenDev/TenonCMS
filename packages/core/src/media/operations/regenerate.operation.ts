import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import type { Modifiers } from "../../schema/index.ts";
import { type MediaCore, mediaOf } from "../runtime/create-media-core.ts";
import { hasVariants } from "../images/decorate.ts";
import type { Storage } from "../storage/types.ts";
import { VARIANTS, variantKey, variantsOf } from "../variants/keys.ts";
import { renderAll } from "../variants/render-all.ts";

/**
 * `cms.media.regenerate()`: brings stored variants in line with the current image options. Deletes variants the options no
 * longer produce and, with `prerender`, renders missing ones. `force` re-renders every variant, or deletes them all without
 * `prerender`. Without `id`, runs for every file and deletes the variants of files that no longer exist.
 * Returns `undefined` for a missing document. Throws when the provider has no `render`, because nothing is stored.
 */
export async function regenerate(core: Core, scope: Scope, id?: string, { force = false } = {}) {
  const media = mediaOf(core);
  if (!media.images?.provider.render)
    throw new Error("integral-cms: regenerate needs an image provider with `render`");
  const db = await q(core, scope);
  const docs = await findDocs(db, "media", id ? { id } : {});
  if (id && !docs.length) return undefined;
  const total = { rendered: 0, removed: 0 };
  for (const doc of docs) {
    const { rendered, removed } = await regenerateDoc(media, doc, force);
    total.rendered += rendered;
    total.removed += removed;
  }
  if (!id) total.removed += await removeOrphans(media.storage, docs);
  return total;
}

async function regenerateDoc(media: MediaCore, doc: Record<string, any>, force: boolean) {
  const { images, storage, allowlist } = media;
  const wanted = hasVariants(images!, doc) ? allowlist : new Map<string, Modifiers>();
  const prerendering = Boolean(images!.provider.prerender);
  const existing = await variantsOf(storage, doc.key);
  let removed = 0;
  for (const id of existing)
    if (!wanted.has(id) || (force && !prerendering)) {
      await storage.delete(variantKey(doc.key, id));
      removed++;
    }
  const ids = [...wanted.keys()];
  const missing = force ? ids : ids.filter((id) => !existing.includes(id));
  const rendered = prerendering ? await renderAll(media, doc.key, missing) : 0;
  return { rendered, removed };
}

// Deletes the variants of files that no longer exist and returns how many.
async function removeOrphans(storage: Storage, docs: Record<string, any>[]) {
  // ponytail: lists every variant in one go. Page through storage if a library outgrows memory.
  const keys = new Set(docs.map((d) => d.key));
  let removed = 0;
  for (const variant of await storage.list(VARIANTS)) {
    const key = variant.slice(VARIANTS.length, variant.lastIndexOf("/"));
    if (keys.has(key)) continue;
    await storage.delete(variant);
    removed++;
  }
  return removed;
}
