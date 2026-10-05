import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";

/** The modifiers of one image read: `format` / `quality`, then the field's preset, then the field's own. */
export function modifiersFor(images: Images, field: ImageOptions = {}): Modifiers {
  const { preset, sizes, ...own } = field;
  return withoutUndefined({
    format: images.format,
    quality: images.quality,
    ...(preset ? images.presets[preset] : undefined),
    ...own,
  });
}

/** IPX short names of the modifiers. */
export const SHORT: Record<keyof Modifiers, string> = {
  width: "w",
  height: "h",
  fit: "fit",
  format: "f",
  quality: "q",
  background: "b",
  blur: "blur",
};

/** Modifier names by IPX short name. */
export const LONG = new Map(
  Object.entries(SHORT).map(([name, short]) => [short, name as keyof Modifiers]),
);

/** Modifiers whose value is a whole number. */
export const NUMERIC = new Set<keyof Modifiers>(["width", "height", "quality", "blur"]);

/** The stable string form of modifiers: IPX syntax with sorted keys, e.g. `f_webp&q_80&w_640`. */
export const modifierId = (modifiers: Modifiers) =>
  Object.entries(withoutUndefined(modifiers))
    .map(([name, value]) => `${SHORT[name as keyof Modifiers] ?? name}_${value}`)
    .sort()
    .join("&");

function withoutUndefined<T extends object>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
