import { createHmac } from "node:crypto";
import type { Modifiers } from "../../schema/fields/image.ts";
import { joinUrl } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `thumbor()`. */
export type ThumborOptions = {
  /** The Thumbor server, e.g. `https://thumbor.example.com`. */
  baseURL: string;
  /** The security key. Without it, URLs are unsigned. */
  key?: string;
  /** Makes relative file URLs absolute for Thumbor's HTTP loader, e.g. `https://example.com`. */
  origin?: string;
};

// Thumbor's fit-in modes. `cover` and no fit crop to the box, Thumbor's default.
const FIT_IN: Partial<Record<NonNullable<Modifiers["fit"]>, string>> = {
  contain: "fit-in",
  fill: "fit-in",
  inside: "fit-in",
  outside: "full-fit-in",
};

/**
 * Image variants through Thumbor: `<baseURL>/<signature>/[fit-in/]<w>x<h>/filters:…/<file URL>`. Core renders nothing.
 * The signature is Thumbor's: HMAC-SHA1 of the path, URL-safe base64 with padding.
 */
export function thumbor({ baseURL, key, origin }: ThumborOptions): ImageProvider {
  return {
    getImage({ url }, modifiers) {
      const source = url.startsWith("/") ? (origin ? joinUrl(origin, url) : url.slice(1)) : url;
      const fitIn = modifiers.fit && FIT_IN[modifiers.fit];
      const filters = thumborFilters(modifiers);
      const path = [
        ...(fitIn ? [fitIn] : []),
        `${modifiers.width ?? 0}x${modifiers.height ?? 0}`,
        ...(filters.length ? [`filters:${filters.join(":")}`] : []),
        source,
      ].join("/");
      return { url: joinUrl(baseURL, `${signature(path, key)}/${path}`) };
    },
  };
}

function thumborFilters({ fit, format, quality, background, blur }: Modifiers) {
  return [
    format && `format(${format === "jpg" ? "jpeg" : format})`,
    quality !== undefined && `quality(${quality})`,
    fit === "contain" && `fill(${background ?? "transparent"})`,
    fit !== "contain" && background && `background_color(${background})`,
    fit === "fill" && "stretch()",
    blur !== undefined && `blur(${blur})`,
  ].filter(Boolean) as string[];
}

function signature(path: string, key?: string) {
  if (!key) return "unsafe";
  return createHmac("sha1", key)
    .update(path)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
