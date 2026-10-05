import { existsSync } from "node:fs";
import { join } from "node:path";

/** URL of the host's favicon, the first of `favicon.svg`, `.ico` and `.png` in its public dir, or `null`. */
export const findFavicon = (publicDir: string) => {
  const file = ["svg", "ico", "png"].find((ext) => existsSync(join(publicDir, `favicon.${ext}`)));
  return file ? `/favicon.${file}` : null;
};

/** Vite `define` that hands the detected favicon to the admin's `entry.ts`. */
export const faviconDefine = (publicDir: string) => ({
  __INTEGRAL_FAVICON__: JSON.stringify(findFavicon(publicDir)),
});
