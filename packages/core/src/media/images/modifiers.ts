import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";

export const drop = <T extends object>(o: T) =>
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

// IPX short names.
export const SHORT: Record<keyof Modifiers, string> = {
  width: "w",
  height: "h",
  fit: "fit",
  format: "f",
  quality: "q",
  background: "b",
  blur: "blur",
};

export const LONG = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k])) as Record<
  string,
  keyof Modifiers
>;

export const NUMERIC = new Set(["width", "height", "quality", "blur"]);

/** The stable string form of modifiers: IPX syntax with sorted keys, e.g. `f_webp&q_80&w_640`. */
export const modifierId = (m: Modifiers) =>
  Object.entries(drop(m))
    .map(([k, v]) => `${SHORT[k as keyof Modifiers] ?? k}_${v}`)
    .sort()
    .join("&");
