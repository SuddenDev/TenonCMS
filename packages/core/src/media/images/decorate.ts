import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";
import { variantsFor } from "./variants-for.ts";

/**
 * A media document with its computed URLs: `url` for every file, and `src` / `srcset` for images, built from `field`'s options.
 * Without a provider, for SVG and for images above `images.maxSize`, `src` is the original and `srcset` is empty.
 */
export function decorate(
  media: { storage: { url(key: string): string }; images?: Images },
  doc: Record<string, any>,
  field?: ImageOptions,
): Record<string, any> {
  const url = media.storage.url(doc.key);
  if (!String(doc.mimeType).startsWith("image/")) return { ...doc, url };
  const { images } = media;
  if (!images || !hasVariants(images, doc)) return { ...doc, url, src: url, srcset: "" };
  const { src, srcset } = variantsFor(images, field, doc.width);
  const at = (m: Modifiers) =>
    images.provider.getImage({ key: doc.key, url, width: doc.width, height: doc.height }, m).url;
  return {
    ...doc,
    url,
    src: at(src),
    srcset: srcset.map((v) => `${at(v.modifiers)} ${v.descriptor}`).join(", "),
  };
}

/** Whether an image gets variants: a raster image with dimensions, at most `images.maxSize`. */
export const hasVariants = (images: Images, doc: Record<string, any>) =>
  String(doc.mimeType).startsWith("image/") &&
  doc.mimeType !== "image/svg+xml" &&
  Boolean(doc.width) &&
  doc.size <= images.maxSize;
