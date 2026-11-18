import { providerParams } from "./provider-params.ts";
import type { ImageProvider } from "./types.ts";

/** Options of `netlify()`. */
export type NetlifyOptions = {
  /** Where the Image CDN answers. Default `/.netlify/images`. */
  baseURL?: string;
};

const PARAMS = { width: "w", height: "h", fit: "fit", format: "fm", quality: "q" };
// Netlify knows only `contain`, `cover` and `fill`.
const FIT = {
  contain: "contain",
  cover: "cover",
  fill: "fill",
  inside: "contain",
  outside: "cover",
};

/**
 * Image variants through the Netlify Image CDN: `/.netlify/images?url=<file>&w=…`. It works on Netlify and in
 * `netlify dev`. A file on another origin, such as a bucket, MUST be allowed in `remote_images` of `netlify.toml`.
 * Core renders nothing. `background` and `blur` do not apply.
 */
export function netlify({ baseURL = "/.netlify/images" }: NetlifyOptions = {}): ImageProvider {
  return {
    getImage({ url }, modifiers) {
      const params = providerParams(modifiers, PARAMS, FIT).map(
        ([name, value]): [string, string] =>
          name === "fm" && value === "jpeg" ? [name, "jpg"] : [name, value],
      );
      return { url: `${baseURL}?${new URLSearchParams([["url", url], ...params])}` };
    },
  };
}
