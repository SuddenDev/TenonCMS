import { consola } from "consola";
import { type Core, type Scope } from "../cms/runtime/types.ts";
import { q } from "../cms/runtime/transaction.ts";
import { findDocs } from "../db/queries/documents/find-documents.query.ts";
import type { Modifiers } from "../schema/index.ts";
import { type MediaCore, mediaOf } from "./core.ts";
import { hasVariants } from "./images.ts";
import type { Storage } from "./storage/types.ts";

// Variants live under `.variants/<key>/<modifier id>`, so one list call finds the variants of a file.

const VARIANTS = ".variants/";
const log = consola.withTag("integral");

/** Where the variant `id` (a modifier id) of the file `key` lives. */
export const variantKey = (key: string, id: string) => `${VARIANTS}${key}/${id}`;

/** The modifier ids of the stored variants of `key`. Deeper keys belong to files in a folder named like `key`. */
async function variantsOf(storage: Storage, key: string) {
  const prefix = `${VARIANTS}${key}/`;
  return (await storage.list(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((id) => !id.includes("/"));
}

/** Renders one variant of the file `key` and stores it. Returns the rendered bytes. */
export async function renderVariant(
  media: MediaCore,
  key: string,
  modifiers: Modifiers,
  id: string,
) {
  const rendered = await media.images!.provider.render!(key, modifiers, media.storage);
  await media.storage.put(variantKey(key, id), rendered.data, rendered.mimeType);
  return rendered;
}

/** Renders the variants `ids` of the file `key` and returns how many succeeded. A failure is logged. */
export async function renderAll(media: MediaCore, key: string, ids: Iterable<string>) {
  let rendered = 0;
  for (const id of ids) {
    try {
      await renderVariant(media, key, media.allowlist.get(id)!, id);
      rendered++;
    } catch (error) {
      log.error(`Rendering ${id} of ${key} failed`, error);
    }
  }
  return rendered;
}

/** Moves a file and its variants. A variant that fails to move is logged; it renders again on request. */
export async function moveWithVariants(storage: Storage, from: string, to: string) {
  await storage.move(from, to);
  await Promise.all(
    (await variantsOf(storage, from)).map((id) =>
      storage.move(variantKey(from, id), variantKey(to, id)).catch((e) => log.error(e)),
    ),
  );
}

/** Deletes a file and its variants. A failed delete is logged. */
export async function deleteWithVariants(storage: Storage, key: string) {
  const variants = await variantsOf(storage, key).catch(() => []);
  await Promise.all(
    [key, ...variants.map((id) => variantKey(key, id))].map((k) =>
      storage.delete(k).catch((e) => log.error(`Deleting "${k}" failed`, e)),
    ),
  );
}

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
