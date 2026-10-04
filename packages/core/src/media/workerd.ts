import type { MediaOptions } from "./config/options.ts";
import type { IpxOptions } from "./images/ipx.ts";
import type { ImageProvider } from "./images/types.ts";
import type { LocalOptions } from "./storage/local.ts";
import type { Storage } from "./storage/types.ts";

// Cloudflare Workers resolve `integral-cms/media/local`, `…/ipx` and `…/default` here: they need a filesystem and sharp.

function unsupported(what: string): never {
  throw new Error(
    `integral-cms: ${what} needs Node.js and does not run on Cloudflare Workers. Use s3() from integral-cms/media/s3 and cloudflare() from integral-cms/media/cloudflare.`,
  );
}

export const local: (options: LocalOptions) => Storage = () => unsupported("local()");
export const ipx: (options?: IpxOptions) => ImageProvider = () => unsupported("ipx()");
/** Without a `media` option, Workers get no media library; `media: true` throws. */
export const defaultMedia = (explicit: boolean): MediaOptions | undefined =>
  explicit ? unsupported("`media: true`") : undefined;
