import type { Modifiers } from "../../schema/fields/image.ts";
import type { ImageProvider } from "../images.ts";

// Cloudflare's names for sharp's `fit`, as in Nuxt Image.
const FIT: Record<NonNullable<Modifiers["fit"]>, string> = {
  cover: "cover",
  contain: "contain",
  fill: "scale-down",
  outside: "crop",
  inside: "pad",
};
const ORDER = ["width", "height", "fit", "format", "quality", "background", "blur"] as const;

/**
 * Image variants through Cloudflare Images on the zone that serves the site: `/cdn-cgi/image/<options>/<url>`.
 * Needs image transformations enabled for the zone. Core renders nothing.
 */
export function cloudflare(): ImageProvider {
  return {
    getImage({ url }, modifiers) {
      const options = ORDER.filter((k) => modifiers[k] !== undefined)
        .map((k) => `${k}=${k === "fit" ? FIT[modifiers.fit!] : modifiers[k]}`)
        .join(",");
      return { url: `/cdn-cgi/image/${options}/${url.replace(/^\//, "")}` };
    },
  };
}
