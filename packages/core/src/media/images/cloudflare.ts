import { API_BASE } from "../../client/index.ts";
import type { Modifiers } from "../../schema/fields/image.ts";
import { encodeKey } from "../storage/types.ts";
import { modifierId } from "./modifiers.ts";
import type { ImageProvider } from "./types.ts";

// Cloudflare's names for sharp's `fit`, as in Nuxt Image.
const FIT: Record<NonNullable<Modifiers["fit"]>, string> = {
  cover: "cover",
  contain: "contain",
  fill: "scale-down",
  outside: "crop",
  inside: "pad",
};
const ORDER = ["width", "height", "fit", "format", "quality", "background", "blur"] as const;
const TRANSFORM = ["width", "height", "fit", "background", "blur"] as const;

/** The part of an Images binding that {@link cloudflare} uses. */
export type ImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): ImageHandle;
};
type ImageHandle = {
  transform(options: Record<string, string | number>): ImageHandle;
  output(options: { format: string; quality?: number }): Promise<{
    contentType(): string;
    image(): ReadableStream<Uint8Array>;
  }>;
};

/** Options of `cloudflare()`. */
export type CloudflareOptions = {
  /**
   * The Images binding, e.g. `env.IMAGES` with `env` from `cloudflare:workers`. Core then renders variants through it,
   * serves them at `/_tenon/media/img/<modifiers>/<key>` and stores them under `.variants/`. Without it, variant URLs
   * point to `/cdn-cgi/image/` on the site's zone.
   */
  binding?: ImagesBinding;
  /** Render every allowed variant right after upload, instead of on first request. Needs `binding`. Default `false`. */
  prerender?: boolean;
};

/**
 * Image variants through Cloudflare Images. With `binding`, core renders and stores them. Without it, they come from
 * `/cdn-cgi/image/<options>/<url>` on the zone that serves the site, which needs image transformations enabled for the
 * zone, and core renders nothing.
 */
export function cloudflare({ binding, prerender = false }: CloudflareOptions = {}): ImageProvider {
  if (!binding)
    return {
      getImage({ url }, modifiers) {
        const options = ORDER.filter((k) => modifiers[k] !== undefined)
          .map((k) => `${k}=${k === "fit" ? FIT[modifiers.fit!] : modifiers[k]}`)
          .join(",");
        return { url: `/cdn-cgi/image/${options}/${url.replace(/^\//, "")}` };
      },
    };

  return {
    prerender,
    getImage: ({ key }, modifiers) => ({
      url: `${API_BASE}/media/img/${modifierId(modifiers)}/${encodeKey(key)}`,
    }),
    async render(key, modifiers, storage) {
      const file = await storage.get(key);
      if (!file) throw new Error(`tenoncms: no media file at ${key}`);
      const transform = Object.fromEntries(
        TRANSFORM.filter((k) => modifiers[k] !== undefined).map((k) => [
          k,
          k === "fit" ? FIT[modifiers.fit!] : modifiers[k]!,
        ]),
      );
      const format = modifiers.format ?? key.split(".").pop()!;
      const result = await binding
        .input(file.body)
        .transform(transform)
        .output({
          format: `image/${format === "jpg" ? "jpeg" : format}`,
          ...(modifiers.quality !== undefined && { quality: modifiers.quality }),
        });
      const data = new Uint8Array(await new Response(result.image()).arrayBuffer());
      return { data, mimeType: result.contentType() };
    },
  };
}
