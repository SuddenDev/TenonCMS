import { encodeKey } from "../storage/types.ts";
import { joinUrl, providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `cloudinary()`. */
export type CloudinaryOptions = {
  /**
   * The delivery URL. `https://res.cloudinary.com/<cloud>/image/upload` uses the key without its extension as the public
   * id. `…/image/upload/<folder>` is an auto-upload mapping of `<folder>` to the bucket or to `<site>/_tenon/media/files/`.
   * `…/image/fetch` fetches the file URL.
   */
  baseURL: string;
  /** Makes relative file URLs absolute for `…/image/fetch`, e.g. `https://example.com`. */
  origin?: string;
};

const PARAMS = {
  width: "w",
  height: "h",
  fit: "c",
  format: "f",
  quality: "q",
  background: "b",
  blur: "e_blur",
};
const FIT = { fill: "fill", inside: "pad", outside: "lpad", cover: "lfill", contain: "scale" };
const MAPPED_FOLDER = /\/image\/upload\/(.+)$/;

/** Image variants through Cloudinary, ported from Nuxt Image's provider. Core renders nothing. */
export function cloudinary({ baseURL, origin = "" }: CloudinaryOptions): ImageProvider {
  const folder = MAPPED_FOLDER.exec(baseURL)?.[1];
  const base = folder ? baseURL.slice(0, -folder.length) : baseURL;
  const fetch = /\/image\/fetch\/?$/.test(baseURL);

  return {
    getImage({ key, url }, modifiers) {
      const operations = providerParams(modifiers, PARAMS, FIT)
        .map(
          ([name, value]) =>
            `${name}${name.includes("_") ? ":" : "_"}${transformValue(name, value)}`,
        )
        .join(",");
      const path = operations ? `${operations}/` : "";
      if (folder) return { url: joinUrl(base, `${path}${folder}/${encodeKey(key)}`) };
      if (fetch) return { url: joinUrl(base, path + encodeURIComponent(absolute(url, origin))) };
      return { url: joinUrl(base, path + encodeKey(key.replace(/\.[^/.]+$/, ""))) };
    },
  };
}

function transformValue(name: string, value: string) {
  if (name === "f" && value === "jpeg") return "jpg";
  if (name === "b" && /^#?[0-9a-f]{3,8}$/i.test(value)) return `rgb:${value.replace("#", "")}`;
  return value;
}

const absolute = (url: string, origin: string) =>
  url.startsWith("/") ? joinUrl(origin, url) : url;
