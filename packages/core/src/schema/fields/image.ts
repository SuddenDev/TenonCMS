import type { MediaFieldOptions } from "./file.ts";

/** Image modifiers, named as in Nuxt Image. A provider MAY accept more. */
export type Modifiers = {
  /** Width in pixels. */
  width?: number;
  /** Height in pixels. */
  height?: number;
  /** How the image fits `width` × `height`, as in sharp. */
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  /** Output format, e.g. `'webp'`, `'avif'`, `'jpeg'`, `'png'`. */
  format?: string;
  /** Output quality, 1 to 100. */
  quality?: number;
  /** Background color for `fit: 'contain'` and transparent images, e.g. `'ffffff'`. */
  background?: string;
  /** Blur radius. */
  blur?: number;
};

/** The `image` option of an `image` field: a preset, modifiers and widths. */
export type ImageOptions = Modifiers & {
  /** Name of a preset in `media.images.presets`. The field's own modifiers override it. */
  preset?: string;
  /** Widths for `srcset`. Default: `media.images.sizes`. */
  sizes?: number[];
};

/** An image of the media library, stored as its id. Reads resolve it to an `Image` with `src` and `srcset`, see `populate`. */
export type ImageField = MediaFieldOptions & {
  type: "image";
  /** How reads build `src` and `srcset`: a preset, modifiers and widths. Needs `media.images`. */
  image?: ImageOptions;
};
