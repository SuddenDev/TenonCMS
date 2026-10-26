import type { AdminOptions } from "../../admin/index.d.ts";
import type { AuthOptions } from "../../auth/config/options.ts";
import type { EmailOptions } from "../../email/types.ts";
import type { mediaCollection } from "../../media/config/collection.ts";
import type { MediaOptions } from "../../media/config/options.ts";
import type { Plugin } from "../../plugins/index.ts";
import type { settings } from "../../presets/settings.ts";
import type { RoleOptions } from "../../users/roles.ts";
import type { CheckRefs, Collection, Global, MediaApi, RootHooks } from "../../schema/index.ts";

export type PopulateOptions = {
  /** Hops resolved by `populate: true`. Default 2. */
  depth?: number;
  /** Limit for HTTP requests. Default 5. The local API has no limit. */
  maxDepth?: number;
};
export type DefaultDepth<P extends PopulateOptions> = P["depth"] extends number ? P["depth"] : 2;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;
// `unknown` without plugins, so `C & PluginCollections<[]>` is `C`.
export type PluginCollections<PL extends readonly Plugin[]> = UnionToIntersection<
  NonNullable<PL[number]["collections"]>
>;
export type PluginGlobals<PL extends readonly Plugin[]> = UnionToIntersection<
  NonNullable<PL[number]["globals"]>
>;

// The `media` collection and `cms.media` exist unless `media: false`.
// Not distributive, and `M = never` (options cast `as never`) counts as no media: otherwise TS2589.
export type MediaCollections<M> = [M] extends [false] ? unknown : { media: MediaCollection };
// Type only: reads compute `url`, and `src` and `srcset` for images. They are not stored and not filterable.
type MediaCollection = {
  fields: (typeof mediaCollection)["fields"] & {
    url: { type: "text"; required: true };
    src: { type: "text" };
    srcset: { type: "text" };
  };
};
export type MediaOf<M> = [M] extends [false] ? {} : { media: MediaApi };

/**
 * Which settings globals `defineCms()` adds. An omitted key is the default from `settings` in `integral-cms/presets`.
 */
export type SettingsOptions = {
  /** Site title, tagline, URL and favicon. `false` drops it, a `Global` replaces it. Stored as `general`. */
  general?: Global | false;
  /** Search and social defaults. `false` drops it, a `Global` replaces it. Stored as `seo`. */
  seo?: Global | false;
};

type Defaults = typeof settings;
type SettingsGlobal<S, K extends keyof Defaults> = K extends keyof S
  ? [S[K]] extends [false]
    ? unknown
    : { [P in K]: S[K] }
  : { [P in K]: Defaults[K] };

// The settings globals of the instance type. Not distributive, and `S = never` (options cast `as never`) counts as omitted: otherwise TS2589.
export type SettingsGlobals<S> = [S] extends [never]
  ? Defaults
  : [S] extends [false]
    ? unknown
    : [S] extends [undefined]
      ? Defaults
      : SettingsGlobal<S, "general"> & SettingsGlobal<S, "seo">;

// Generic inference skips excess property checks, so an unknown key maps to `never`.
type ExactSettings<S> = [S] extends [never]
  ? unknown
  : [S] extends [object]
    ? { [K in Exclude<keyof S, keyof SettingsOptions>]: never }
    : unknown;

/**
 * Content localization. Collections and globals opt in with `localized: true`; their fields are then localized unless
 * a field sets `localized: false`.
 */
export type LocalizationOptions<L extends string = string> = {
  /** The locale codes of the site, like `["en", "de"]`. MUST NOT be empty or hold duplicates. */
  locales: readonly L[];
  /** The locale that reads use without a `locale` option, and the one a missing value falls back to. MUST be in `locales`. */
  defaultLocale: NoInfer<L>;
  /** A missing value or locale reads as the default locale's. Default `true`. */
  fallback?: boolean;
  /**
   * How URLs carry the locale. Default `{ prefix: "except-default" }`.
   * - `{ prefix: "except-default" }`: `/de/about`, and `/about` for the default locale.
   * - `{ prefix: "always" }`: `/en/about` and `/de/about`.
   * - `false`: the host routes on its own.
   */
  routing?: { prefix: "except-default" | "always" } | false;
};

/** The `localization` option with its defaults applied. */
export type Localization<L extends string = string> = Required<LocalizationOptions<L>>;

export type CmsOptions<
  C extends Record<string, Collection>,
  G extends Record<string, Global>,
  A extends AuthOptions = {},
  P extends PopulateOptions = {},
  PL extends readonly Plugin[] = [],
  M extends MediaOptions | boolean | undefined = undefined,
  S extends false | SettingsOptions | undefined = undefined,
  L extends string = string,
> = {
  // The plain `Record` gives inline hooks a contextual type. Without it, their arguments are implicit `any`.
  collections?: C & NoInfer<CheckRefs<C, C & PluginCollections<PL>> & Record<string, Collection>>;
  globals?: G & NoInfer<CheckRefs<G, C & PluginCollections<PL>> & Record<string, Global>>;
  /**
   * Branding, custom fields, custom pages and the admin bar. Inline or imported from your own module; check an
   * extracted object with `satisfies AdminOptions` from `integral-cms/admin`. Plugins add their own.
   */
  admin?: AdminOptions;
  /** Plugins, from `definePlugin()`. Their collections, globals and hooks merge into the instance. */
  plugins?: PL;
  /** Defaults for reads that resolve relations. */
  populate?: P;
  database: { url: string; authToken?: string };
  /** Secret for signing sessions. MUST be at least 32 random characters in production. */
  secret: string;
  // `& AuthOptions` types hook parameters. Inference alone leaves them `any`.
  /** better-auth options. Core owns `database`, `basePath` and `secret`. */
  auth?: A & AuthOptions;
  /** Server-side delivery and authentication email templates. Omitted: sending rejects. */
  email?: EmailOptions;
  /**
   * Extra user roles, keyed by name (`[a-z0-9-]`). `admin` (manages users) and `editor` are built in and MUST NOT
   * be listed. `access` rules name roles: `create: ["admin", "author"]`. Without rules, every role edits all content.
   */
  roles?: Record<string, RoleOptions>;
  /** Hooks for every collection and global. */
  hooks?: RootHooks;
  /**
   * The media library: uploads, the `media` collection, and `image` and `file` fields.
   * - omitted or `true`: files in `./uploads`, WebP variants at quality 85 rendered at upload (`local()` and `ipx()`).
   *   On Cloudflare Workers, omitted means no media library and `true` throws.
   * - `false`: no media library. Core adds no routes, and `image` and `file` fields throw at startup.
   * - an object: your own storage, limits, images and hooks.
   */
  media?: M;
  /**
   * The settings globals `general` and `seo`, shown on the admin's Settings page.
   * - omitted: both defaults. Without a media library, they leave out `favicon` and `image`.
   * - `false`: neither.
   * - an object: `{ seo: false }` drops one, `{ general: myGlobal }` replaces one (stored under the same name).
   *
   * A collection or global named `general` or `seo` throws while that default is on.
   */
  settings?: S & NoInfer<ExactSettings<S>>;
  /** Content in several languages. Without it, nothing is localized and `localized` options throw. See {@link LocalizationOptions}. */
  localization?: LocalizationOptions<L>;
  /**
   * The URL of the site, like `https://example.com`. The admin's preview resolves relative preview URLs against it.
   * Defaults to the admin's own origin. Live preview on another origin needs the site to run `preview()` too.
   */
  site?: string;
};
