export { createClient } from "./create-client.ts";
export { CmsError } from "./errors.ts";
export { API_BASE, API_KEY_HEADER, LOCK_TTL } from "./constants.ts";
// `format.ts` imports only `read-zip.ts`, which has no imports.
export { readArchiveManifest } from "../transfer/format.ts";
export type {
  ArchiveCheck,
  ArchiveCounts,
  ArchiveScope,
  ExportOptions,
  ImportCounts,
  ImportMode,
  Manifest,
} from "../transfer/format.ts";
export type { Lock } from "../locks/types.ts";
export type { Version, VersionWithData } from "../versions/types.ts";
export type { CronEntry, Job, JobFilter, JobStatus } from "../jobs/types.ts";
export type * from "./types/index.ts";
export type { Checked, Locale, ReadOptions } from "../schema/index.ts";
export type { Localization, LocalizationOptions } from "../cms/config/options.ts";
export { formatMask } from "../schema/fields/format-mask.ts";

// Helpers have no imports, so this file stays safe in the browser.
export {
  type BreadcrumbsOptions,
  breadcrumbs,
  localeFromPath,
  localizePath,
  type MenuItem,
  menuItems,
  type RobotsRule,
  robotsTxt,
  SLUG_PATTERN,
  type SeoLinkTag,
  type SeoMetaTag,
  type SeoTemplates,
  seoHead,
  seoMeta,
  type SitemapEntry,
  sitemapXml,
  slugify,
  switchTarget,
} from "../helpers/index.ts";

/**
 * Holds the host's `cms` type, so `createClient()` is typed without a type argument.
 * The Astro and Nuxt adapters fill it in. Elsewhere, map `#tenon/config` to your config file and
 * load `tenoncms/register` in `tsconfig.json`:
 * @example
 * "paths": { "#tenon/config": ["./tenon.config.ts"] },
 * "types": ["tenoncms/register"]
 */
export interface Register {}
