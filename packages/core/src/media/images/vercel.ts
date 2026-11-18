import { DEFAULT_SIZES } from "./modifiers.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `vercel()`. */
export type VercelOptions = {
  /** The widths Vercel allows. They MUST equal `images.sizes` of the deployment's image config. Default: `images.sizes`'s default. */
  sizes?: number[];
};

/**
 * Image variants through Vercel Image Optimization: `/_vercel/image?url=<file>&w=<width>&q=<quality>`. Vercel resizes
 * and picks the format from the browser's `Accept` header, so only `width` and `quality` apply. The width becomes the
 * smallest allowed width that is at least as wide. Outside Vercel (no `VERCEL` variable), as in development, URLs are
 * the originals. Core renders nothing.
 */
export function vercel({ sizes = DEFAULT_SIZES }: VercelOptions = {}): ImageProvider {
  const allowed = [...sizes].sort((a, b) => a - b);
  return {
    getImage({ url, width }, modifiers) {
      if (!globalThis.process?.env.VERCEL) return { url };
      const wanted = modifiers.width ?? width;
      const w = allowed.find((size) => size >= wanted) ?? allowed.at(-1)!;
      const params = new URLSearchParams({
        url,
        w: String(w),
        q: String(modifiers.quality ?? 100),
      });
      return { url: `/_vercel/image?${params}` };
    },
  };
}
