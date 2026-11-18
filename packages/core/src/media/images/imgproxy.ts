import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import type { Modifiers } from "../../schema/fields/image.ts";
import { joinUrl, providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `imgproxy()`. */
export type ImgproxyOptions = {
  /** The imgproxy server, e.g. `https://img.example.com`. */
  baseURL: string;
  /** The signing key, hex. Without `key` and `salt`, URLs are unsigned. */
  key?: string;
  /** The signing salt, hex. */
  salt?: string;
  /** Makes relative file URLs absolute, e.g. `https://example.com`. Not needed with `IMGPROXY_BASE_URL`. */
  origin?: string;
};

const SIZE = { width: "w", height: "h" };
const OUTPUT = { format: "f", quality: "q", background: "bg", blur: "bl" };
// The resizing type of each `fit` for a box of width and height, as Nuxt Image maps it. Without a box, it is `fit`.
const RESIZING = { cover: "fill", contain: "fit", fill: "force", inside: "fit", outside: "fill" };

/**
 * Image variants through imgproxy: `<baseURL>/<signature>/<processing>/<base64 file URL>`, ported from Nuxt Image's
 * provider. Core renders nothing.
 */
export function imgproxy({ baseURL, key, salt, origin = "" }: ImgproxyOptions): ImageProvider {
  return {
    getImage({ url }, modifiers) {
      const source = Buffer.from(url.startsWith("/") ? origin + url : url).toString("base64url");
      const options = [
        ...resizing(modifiers),
        ...providerParams(modifiers, SIZE),
        ...extend(modifiers),
        ...providerParams(modifiers, OUTPUT),
      ];
      const path = `/${[...options.map(([name, value]) => `${name}:${value}`), source].join("/")}`;
      return { url: joinUrl(baseURL, signature(path, key, salt) + path) };
    },
  };
}

const isBox = ({ width, height }: Modifiers) => !!width && !!height;

function resizing(modifiers: Modifiers): [string, string][] {
  if (!modifiers.fit) return [];
  return [["rt", isBox(modifiers) ? RESIZING[modifiers.fit] : "fit"]];
}

// `contain` pads the image to the box.
const extend = (modifiers: Modifiers): [string, string][] =>
  modifiers.fit === "contain" && isBox(modifiers) ? [["ex", "1"]] : [];

function signature(path: string, key?: string, salt?: string) {
  if (!key || !salt) return "unsafe";
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(Buffer.from(salt, "hex"))
    .update(path)
    .digest("base64url");
}
