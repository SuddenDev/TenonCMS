import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import type { MediaOptions } from "./config/options.ts";
import { local } from "./storage/local/index.ts";

/**
 * The media library of `defineCms()` without a `media` option or with `media: true`: files in `./.uploads`, served as
 * originals. Variants need `images` with a provider. Cloudflare Workers resolve this entry to `workerd.ts`.
 *
 * A read-only working directory, as in serverless functions, cannot keep uploads. There, an omitted `media` means no media
 * library and `media: true` throws.
 */
export function defaultMedia(explicit: boolean): MediaOptions | undefined {
  if (!isWritable(process.cwd())) {
    if (!explicit) return undefined;
    throw new Error(
      "tenoncms: `media: true` stores files in ./.uploads, but the working directory is read-only. Use s3() from tenoncms/media/s3.",
    );
  }
  return { storage: local({ dir: resolve(".uploads") }) };
}

function isWritable(dir: string) {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
