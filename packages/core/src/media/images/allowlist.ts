import type { ImageOptions, Modifiers } from "../../schema/fields/image.ts";
import type { Images } from "./types.ts";
import { modifiersFor, modifierId } from "./modifiers.ts";
import { variantsFor } from "./variants-for.ts";

/**
 * Every modifier combination the config can produce, by modifier id. The `/img` route accepts only these.
 * Covers the global options, each preset and each `image` field's options: without a width and at every `srcset` width.
 */
export function allowlist(images: Images, fields: (ImageOptions | undefined)[]) {
  const presets = Object.keys(images.presets).map((preset) => ({ preset }));
  const ids = new Map<string, Modifiers>();
  for (const field of [undefined, ...presets, ...fields]) {
    const { srcset } = variantsFor(images, field);
    const all = [modifiersFor(images, field), ...srcset.map((v) => v.modifiers)];
    for (const modifiers of all) ids.set(modifierId(modifiers), modifiers);
  }
  return ids;
}
