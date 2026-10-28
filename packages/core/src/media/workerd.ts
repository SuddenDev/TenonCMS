import type { MediaOptions } from "./config/options.ts";
import type { IpxOptions } from "./images/ipx.ts";
import type { ImageProvider } from "./images/types.ts";
import type { LocalOptions } from "./storage/local/index.ts";
import type { Storage } from "./storage/types.ts";

// Cloudflare Workers resolve `integral-cms/media/local`, `…/ipx` and `…/default` here: they need a filesystem and sharp.

function unsupported(what: string): never {
  throw new Error(
    `integral-cms: ${what} needs Node.js and does not run on Cloudflare Workers. Use r2() from integral-cms/media/r2 and cloudflare() from integral-cms/media/cloudflare.`,
  );
}

/** Throws: local storage needs a filesystem. */
export const local: (options: LocalOptions) => Storage = () => unsupported("local()");
/** Throws: IPX needs sharp. */
export const ipx: (options?: IpxOptions) => ImageProvider = () => unsupported("ipx()");
/** Without a `media` option, Workers get no media library; `media: true` throws. */
export const defaultMedia = (explicit: boolean): MediaOptions | undefined =>
  explicit ? unsupported("`media: true`") : undefined;
