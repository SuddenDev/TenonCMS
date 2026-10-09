import { existsSync } from "node:fs";
import { join } from "node:path";

/** URL of the host's favicon, the first of `favicon.svg`, `.ico` and `.png` in its public dir, or `null`. */
export function findFavicon(publicDir: string) {
  const ext = ["svg", "ico", "png"].find((ext) => existsSync(join(publicDir, `favicon.${ext}`)));
  return ext ? `/favicon.${ext}` : null;
}

/** Vite `define` that hands the detected favicon to the admin's `entry.ts`. */
export function faviconDefine(publicDir: string) {
  return { __INTEGRAL_FAVICON__: JSON.stringify(findFavicon(publicDir)) };
}
