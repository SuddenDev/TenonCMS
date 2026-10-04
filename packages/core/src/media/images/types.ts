import type { Modifiers } from "../../schema/fields/image.ts";
import type { Storage } from "../storage/types.ts";

/** Builds variant URLs and, for providers core serves, renders variants. Modeled on Nuxt Image providers. */
export type ImageProvider = {
  /** Builds the URL of one variant. Runs on the server during reads. Same idea as Nuxt Image's `getImage`. */
  getImage(
    src: { key: string; url: string; width: number; height: number },
    modifiers: Modifiers,
  ): { url: string };
  /** For providers core serves at `/api/cms/media/img`. Reads the original from `storage` and returns the rendered bytes. */
  render?(
    key: string,
    modifiers: Modifiers,
    storage: Storage,
  ): Promise<{ data: Uint8Array; mimeType: string }>;
  /** Render all allowed variants after upload instead of on first request. Needs `render`. */
  prerender?: boolean;
};

/** `media.images` with defaults. */
export type Images = {
  provider: ImageProvider;
  format: string;
  quality: number;
  sizes: number[];
  presets: Record<string, Modifiers>;
  maxSize: number;
};

/** One `srcset` entry: its modifiers and its descriptor, `640w` or `2x`. */
export type Variant = { modifiers: Modifiers; descriptor: string };
