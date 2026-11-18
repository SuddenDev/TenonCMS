import { encodeKey } from "../storage/types.ts";
import { joinUrl, providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `imgix()`. */
export type ImgixOptions = {
  /** The imgix domain, e.g. `https://my-site.imgix.net`. Its source MUST serve the storage keys: the bucket, or `<site>/_tenon/media/files/`. */
  baseURL: string;
};

const PARAMS = {
  width: "w",
  height: "h",
  fit: "fit",
  format: "fm",
  quality: "q",
  background: "bg",
  blur: "blur",
};
const FIT = { fill: "scale", inside: "max", outside: "min", cover: "crop", contain: "fill" };

/** Image variants through imgix: `<baseURL>/<key>?w=…`. Core renders nothing. */
export function imgix({ baseURL }: ImgixOptions): ImageProvider {
  return {
    getImage({ key }, modifiers) {
      const params = providerParams({ ...modifiers, format: jpg(modifiers.format) }, PARAMS, FIT);
      const query = params.length ? `?${new URLSearchParams(params)}` : "";
      return { url: joinUrl(baseURL, encodeKey(key)) + query };
    },
  };
}

const jpg = (format?: string) => (format === "jpeg" ? "jpg" : format);
