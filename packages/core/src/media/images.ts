import type { ImageOptions, Modifiers } from "../schema/fields/image.ts";
import type { Storage } from "./storage/types.ts";

/** Builds variant URLs and, for providers core serves, renders variants. Modeled on Nuxt Image providers. */
export type ImageProvider = {
  /** Builds the URL of one variant. Runs on the server during reads. Same idea as Nuxt Image's `getImage`. */
  getImage(
    src: { key: string; url: string; width: number; height: number },
    modifiers: Modifiers,
  ): { url: string };
  /** For providers core serves at `/api/cms/media/img`. Reads the original from `storage` and returns the rendered bytes. */
  render?(
    key: string,
    modifiers: Modifiers,
    storage: Storage,
  ): Promise<{ data: Uint8Array; mimeType: string }>;
  /** Render all allowed variants after upload instead of on first request. Needs `render`. */
  prerender?: boolean;
};

/** `media.images` with defaults. */
export type Images = {
  provider: ImageProvider;
  format: string;
  quality: number;
  sizes: number[];
  presets: Record<string, Modifiers>;
  maxSize: number;
};

/** One `srcset` entry: its modifiers and its descriptor, `640w` or `2x`. */
export type Variant = { modifiers: Modifiers; descriptor: string };

const drop = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** The modifiers of one image read: `format` / `quality`, then the field's preset, then the field's own. */
export function modifiersFor(images: Images, field: ImageOptions = {}): Modifiers {
  const { preset, sizes, ...own } = field;
  return drop({
    format: images.format,
    quality: images.quality,
    ...(preset ? images.presets[preset] : undefined),
    ...own,
  });
}

/**
 * `src` and the `srcset` entries of an image `width` pixels wide. Widths at or above `width` are dropped, so nothing is upscaled.
 * A fixed width without field `sizes` gives `1x` / `2x`. Without `width` nothing is dropped, for the allowlist.
 */
export function variantsFor(
  images: Images,
  field: ImageOptions | undefined,
  width?: number,
): { src: Modifiers; srcset: Variant[] } {
  const m = modifiersFor(images, field);
  const at = (w: number): Modifiers => ({
    ...m,
    width: w,
    ...(m.width && m.height && { height: Math.round((m.height * w) / m.width) }),
  });
  if (m.width && !field?.sizes) {
    const srcset = [1, 2]
      .filter((d) => d === 1 || !width || m.width! * d <= width)
      .map((d) => ({ modifiers: at(m.width! * d), descriptor: `${d}x` }));
    return { src: srcset[0].modifiers, srcset };
  }
  const widths = [...(field?.sizes ?? images.sizes)]
    .sort((a, b) => a - b)
    .filter((w) => !width || w < width);
  const srcset = widths.map((w) => ({ modifiers: at(w), descriptor: `${w}w` }));
  return { src: srcset.at(-1)?.modifiers ?? m, srcset };
}

// IPX short names.
const SHORT: Record<keyof Modifiers, string> = {
  width: "w",
  height: "h",
  fit: "fit",
  format: "f",
  quality: "q",
  background: "b",
  blur: "blur",
};
const LONG = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k])) as Record<
  string,
  keyof Modifiers
>;
const NUMERIC = new Set(["width", "height", "quality", "blur"]);

/** The stable string form of modifiers: IPX syntax with sorted keys, e.g. `f_webp&q_80&w_640`. */
export const modifierId = (m: Modifiers) =>
  Object.entries(drop(m))
    .map(([k, v]) => `${SHORT[k as keyof Modifiers] ?? k}_${v}`)
    .sort()
    .join("&");

/**
 * Every modifier combination the config can produce: the global options and each preset, and each `image` field's options,
 * each with all its widths and without a width, by modifier id. The `/img` route accepts only these.
 */
export function allowlist(images: Images, fields: (ImageOptions | undefined)[]) {
  const ids = new Map<string, Modifiers>();
  const presets = Object.keys(images.presets).map((preset) => ({ preset }));
  for (const field of [undefined, ...presets, ...fields]) {
    const { srcset } = variantsFor(images, field);
    for (const m of [modifiersFor(images, field), ...srcset.map((v) => v.modifiers)])
      ids.set(modifierId(m), m);
  }
  return ids;
}

/** Parses `<modifiers>/<key>` of an `/img` path. `id` is the normalized modifiers string. `undefined` for a bad path. */
export function parseImgPath(
  path: string,
): { id: string; modifiers: Modifiers; key: string } | undefined {
  const slash = path.indexOf("/");
  if (slash < 1 || slash === path.length - 1) return undefined;
  const modifiers: Record<string, string | number> = {};
  for (const part of path.slice(0, slash).split(/[&,]/)) {
    const i = part.indexOf("_");
    const name = LONG[part.slice(0, i)];
    const value = part.slice(i + 1);
    if (i < 1 || !name || !value) return undefined;
    if (NUMERIC.has(name) && !/^\d+$/.test(value)) return undefined;
    modifiers[name] = NUMERIC.has(name) ? Number(value) : value;
  }
  return { id: modifierId(modifiers), modifiers, key: path.slice(slash + 1) };
}

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
