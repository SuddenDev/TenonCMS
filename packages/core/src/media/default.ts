import { resolve } from "node:path";
import { ipx } from "./images/ipx.ts";
import type { MediaOptions } from "./index.ts";
import { local } from "./storage/local.ts";

/**
 * The media library of `defineCms()` without a `media` option or with `media: true`: files in `./.uploads`, WebP variants at
 * quality 85, rendered at upload. Cloudflare Workers resolve this entry to `workerd.ts`.
 */
export const defaultMedia: (explicit: boolean) => MediaOptions = () => ({
  storage: local({ dir: resolve(".uploads") }),
  images: { provider: ipx({ prerender: true }) },
});
