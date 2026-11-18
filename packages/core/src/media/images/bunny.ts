import { encodeKey } from "../storage/types.ts";
import { joinUrl, providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `bunny()`. */
export type BunnyOptions = {
  /** The pull zone with Bunny Optimizer, e.g. `https://my-site.b-cdn.net`. Its origin MUST serve the storage keys: the bucket, or `<site>/_tenon/media/files/`. */
  baseURL: string;
};

const PARAMS = { width: "width", height: "height", quality: "quality", blur: "blur" };

/**
 * Image variants through Bunny Optimizer: `<baseURL>/<key>?width=…`. Bunny picks the format, and `fit` and `background`
 * do not apply. Core renders nothing.
 */
export function bunny({ baseURL }: BunnyOptions): ImageProvider {
  return {
    getImage({ key }, modifiers) {
      const params = providerParams(modifiers, PARAMS);
      const query = params.length ? `?${new URLSearchParams(params)}` : "";
      return { url: joinUrl(baseURL, encodeKey(key)) + query };
    },
  };
}
