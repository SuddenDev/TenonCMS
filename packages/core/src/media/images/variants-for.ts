import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images, Variant } from "./types.ts";
import { modifiersFor } from "./modifiers.ts";

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
