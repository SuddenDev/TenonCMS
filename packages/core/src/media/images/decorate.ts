import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";
import { thumbnailUrl } from "../variants/thumbnail.ts";
import { variantsFor } from "./variants-for.ts";

/**
 * A media document with its computed URLs: `url` for every file, and `src` / `srcset` for images, built from `field`'s options.
 * Without a provider, for SVG and for images above `images.maxSize`, `src` is the original and `srcset` is empty. Without a
 * provider, raster images also get `thumbnail`, the admin's small preview. With `media.origin`, each URL that is a path
 * starts with it; the provider still gets the original's stored URL.
 */
export function decorate(
  media: { storage: { url(key: string): string }; images?: Images; origin?: string },
  doc: Record<string, any>,
  field?: ImageOptions,
): Record<string, any> {
  const on = (path: string) => onOrigin(media.origin, path);
  const stored = media.storage.url(doc.key);
  const url = on(stored);
  if (!isImage(doc)) return { ...doc, url };

  const { images } = media;
  if (!images) {
    const thumbnail = isRaster(doc) ? { thumbnail: on(thumbnailUrl(doc.key)) } : {};
    return { ...doc, url, src: url, srcset: "", ...thumbnail };
  }
  if (!hasVariants(images, doc)) return { ...doc, url, src: url, srcset: "" };

  const { src, srcset } = variantsFor(images, field, doc.width);
  const original = { key: doc.key, url: stored, width: doc.width, height: doc.height };
  const urlOf = (modifiers: Modifiers) => on(images.provider.getImage(original, modifiers).url);
  return {
    ...doc,
    url,
    src: urlOf(src),
    srcset: srcset.map((v) => `${urlOf(v.modifiers)} ${v.descriptor}`).join(", "),
  };
}

/** Whether an image gets variants: a raster image, at most `images.maxSize`. */
export const hasVariants = (images: Images, doc: Record<string, any>) =>
  isRaster(doc) && doc.size <= images.maxSize;

/** Whether a file is a raster image with dimensions: not an SVG, and with a readable header. */
export const isRaster = (doc: Record<string, any>) =>
  isImage(doc) && doc.mimeType !== "image/svg+xml" && Boolean(doc.width);

// A URL with a scheme or a host stays as it is.
function onOrigin(origin: string | undefined, url: string) {
  return origin && url.startsWith("/") && !url.startsWith("//") ? origin + url : url;
}

function isImage(doc: Record<string, any>) {
  return String(doc.mimeType).startsWith("image/");
}
