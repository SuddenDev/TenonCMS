import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images, Variant } from "./types.ts";
import { modifiersFor } from "./modifiers.ts";

/**
 * `src` and the `srcset` entries of an image `width` pixels wide. Entries wider than the image are left out, so nothing
 * is upscaled. Without `width`, as for the allowlist, nothing is left out.
 * @returns `1x` / `2x` entries for a fixed width without field `sizes`, else one `<w>w` entry per size.
 */
export function variantsFor(
  images: Images,
  field: ImageOptions | undefined,
  width?: number,
): { src: Modifiers; srcset: Variant[] } {
  const base = modifiersFor(images, field);

  if (base.width && !field?.sizes) {
    const srcset = densities(base, base.width, width);
    return { src: srcset[0].modifiers, srcset };
  }

  // `src` is the widest entry, or the plain modifiers when no size fits.
  const srcset = bySize(base, field?.sizes ?? images.sizes, width);
  return { src: srcset.at(-1)?.modifiers ?? base, srcset };
}

// `1x` at the fixed width, and `2x` unless the image is too narrow for it.
function densities(base: Modifiers, fixed: number, width?: number): Variant[] {
  const fits = (density: number) => density === 1 || !width || fixed * density <= width;
  return [1, 2]
    .filter(fits)
    .map((density) => ({ modifiers: resize(base, fixed * density), descriptor: `${density}x` }));
}

// One entry per size below the image width, smallest first.
function bySize(base: Modifiers, sizes: number[], width?: number): Variant[] {
  return [...sizes]
    .sort((a, b) => a - b)
    .filter((size) => !width || size < width)
    .map((size) => ({ modifiers: resize(base, size), descriptor: `${size}w` }));
}

// `base` at width `w`. With a fixed width and height, the height scales along, so the aspect ratio stays.
function resize(base: Modifiers, w: number): Modifiers {
  if (!base.width || !base.height) return { ...base, width: w };
  return { ...base, width: w, height: Math.round((base.height * w) / base.width) };
}
