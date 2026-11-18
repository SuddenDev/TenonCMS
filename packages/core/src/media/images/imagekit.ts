import { encodeKey } from "../storage/types.ts";
import { joinUrl, providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `imagekit()`. */
export type ImagekitOptions = {
  /** The URL endpoint, e.g. `https://ik.imagekit.io/<id>`. Its origin MUST serve the storage keys: the bucket, or `<site>/_tenon/media/files/`. */
  baseURL: string;
};

const PARAMS = {
  width: "w",
  height: "h",
  fit: "c",
  format: "f",
  quality: "q",
  background: "bg",
  blur: "bl",
};
const FIT = {
  cover: "maintain_ratio",
  contain: "pad_resize",
  fill: "force",
  inside: "at_max",
  outside: "at_least",
};

/** Image variants through ImageKit: `<baseURL>/<key>?tr=w-…`, ported from Nuxt Image's provider. Core renders nothing. */
export function imagekit({ baseURL }: ImagekitOptions): ImageProvider {
  return {
    getImage({ key }, modifiers) {
      const transform = providerParams(modifiers, PARAMS, FIT)
        // ImageKit sets padding through the crop mode `cm`, not the crop strategy `c`.
        .map(
          ([name, value]) => `${value === "pad_resize" ? "cm" : name}-${value.replace(/^#/, "")}`,
        )
        .join(",");
      const url = joinUrl(baseURL, encodeKey(key));
      return { url: transform ? `${url}?tr=${transform}` : url };
    },
  };
}
