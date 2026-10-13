export { createClient } from "./create-client.ts";
export { CmsError } from "./errors.ts";
export { API_BASE } from "./constants.ts";
export type * from "./types/index.ts";
export type { Checked, Locale, ReadOptions } from "../schema/index.ts";
export type { Localization, LocalizationOptions } from "../cms/config/options.ts";

// Helpers have no imports, so this file stays safe in the browser.
export {
  type BreadcrumbsOptions,
  breadcrumbs,
  localeFromPath,
  localizePath,
  SLUG_PATTERN,
  seoMeta,
  slugify,
  switchTarget,
} from "../helpers/index.ts";

/**
 * Holds the host's `cms` type, so `createClient()` is typed without a type argument.
 * The Astro and Nuxt adapters fill it in. Elsewhere, map `#integral/config` to your config file and
 * load `integral-cms/register` in `tsconfig.json`:
 * @example
 * "paths": { "#integral/config": ["./integral.config.ts"] },
 * "types": ["integral-cms/register"]
 */
export interface Register {}
