import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";
import { modifiersFor, modifierId } from "./modifiers.ts";
import { variantsFor } from "./variants-for.ts";

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
