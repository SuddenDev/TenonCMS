import type { MediaHooks, Modifiers } from "../../schema/index.ts";
import type { ImageProvider } from "../images/types.ts";
import type { Storage } from "../storage/types.ts";

/** The `media.images` option: responsive image variants. */
export type ImagesOptions = {
  /** Builds variant URLs: `ipx()` from `integral-cms/media/ipx`, `cloudflare()` from `integral-cms/media/cloudflare`, or your own. */
  provider: ImageProvider;
  /** Default output format. Default `'webp'`. */
  format?: string;
  /** Default output quality. Default `85`. */
  quality?: number;
  /** Widths for `srcset`. Default `[320, 640, 1024, 1536, 1920]`. */
  sizes?: number[];
  /** Named modifier sets that `image` fields pick with `image: { preset }`. */
  presets?: Record<string, Modifiers>;
  /** Images above this size in bytes get dimensions but no variants. Default 50 MB. */
  maxSize?: number;
};

/** The `media` option of `defineCms()`. */
export type MediaOptions = {
  /** Where files live: `local()` from `integral-cms/media/local`, `s3()` from `integral-cms/media/s3`, or your own. */
  storage: Storage;
  /** Largest accepted file in bytes. Default 100 MB. */
  maxSize?: number;
  /** Allowed MIME types, `type/*` wildcards allowed, e.g. `['image/*', 'application/pdf']`. Default: all types. */
  accept?: string[];
  /** Responsive image variants. `false` serves originals only. Default `false`. */
  images?: ImagesOptions | false;
  /** Hooks of the media library. See {@link MediaHooks}. */
  hooks?: MediaHooks;
};
