import { guard } from "../../access/rule.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { transaction } from "../../cms/runtime/transaction.ts";
import { collectionTarget } from "../../content/targets.ts";
import { ValidationError } from "../../errors.ts";
import { isRaster } from "../images/decorate.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { loadMedia, readMedia } from "../runtime/read-media.ts";
import { variantKey } from "../variants/keys.ts";
import { THUMBNAIL, thumbnailType, validateThumbnail } from "../variants/thumbnail.ts";

/**
 * `cms.media.setThumbnail()`: stores the admin's preview of an image, which the browser makes because no image provider
 * is set. Replaces an earlier one. The `update` rule runs first.
 * @returns The media document, or `undefined` for a missing one.
 * @throws When `media.images` is set: the provider's variants are the preview then.
 * @throws {ValidationError} For a file that is not a raster image, or a thumbnail that is not a small WebP or JPEG.
 * @throws {ForbiddenError} When `media.access.update` denies, for a missing document too.
 */
export async function setThumbnail(core: Core, scope: Scope, id: string, data: Uint8Array) {
  const media = mediaOf(core);
  if (media.images) throw new Error("tenoncms: thumbnails are stored only without `media.images`");
  const doc = await transaction(core, scope, async (scope) => {
    await guard(core, scope, collectionTarget("media"), "update", { id });
    return loadMedia(core, scope, id);
  });
  if (!doc) return undefined;
  if (!isRaster(doc)) throw new ValidationError({ "": "Only raster images have a thumbnail" });
  validateThumbnail(data);

  await media.storage.put(variantKey(doc.key, THUMBNAIL), data, thumbnailType(data)!);
  return readMedia(core, doc);
}
