import type { AuthOptions } from "./auth.ts";
import type { MediaOptions } from "../media/index.ts";
import type { Plugin } from "../plugins/index.ts";
import type { settings } from "../presets/settings.ts";
import type { CheckRefs, Collection, Global, RootHooks } from "../schema/index.ts";

export type PopulateConfig = {
  /** Hops resolved by `populate: true`. Default 2. */
  depth?: number;
  /** Limit for HTTP requests. Default 5. The local API has no limit. */
  maxDepth?: number;
};
export type DefaultDepth<P extends PopulateConfig> = P["depth"] extends number ? P["depth"] : 2;

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

/**
 * Which settings globals `defineCms()` adds. An omitted key is the default from `settings` in `integral-cms/presets`.
 */
export type SettingsOption = {
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
    ? { [K in Exclude<keyof S, keyof SettingsOption>]: never }
    : unknown;

export type CmsOptions<
  C extends Record<string, Collection>,
  G extends Record<string, Global>,
  A extends AuthOptions = {},
  P extends PopulateConfig = {},
  PL extends readonly Plugin[] = [],
  M extends MediaOptions | boolean | undefined = undefined,
  S extends false | SettingsOption | undefined = undefined,
> = {
  // The plain `Record` gives inline hooks a contextual type. Without it, their arguments are implicit `any`.
  collections?: C & NoInfer<CheckRefs<C, C & PluginCollections<PL>> & Record<string, Collection>>;
  globals?: G & NoInfer<CheckRefs<G, C & PluginCollections<PL>> & Record<string, Global>>;
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
  /** Hooks for every collection and global. */
  hooks?: RootHooks;
  /**
   * The media library: uploads, the `media` collection, and `image` and `file` fields.
   * - omitted or `true`: files in `./uploads`, WebP variants at quality 85 rendered at upload (`local()` and `ipx()`).
   *   On Cloudflare Workers, omitted means no media library and `true` throws.
   * - `false`: no media library. Core adds no routes, and `image` and `file` fields throw at startup.
   * - an object: your own storage, limits, images and hooks.
   */
  media?: M /**
   * The settings globals `general` and `seo`, shown on the admin's Settings page.
   * - omitted: both defaults. Without a media library, they leave out `favicon` and `image`.
   * - `false`: neither.
   * - an object: `{ seo: false }` drops one, `{ general: myGlobal }` replaces one (stored under the same name).
   *
   * A collection or global named `general` or `seo` throws while that default is on.
   */;
  settings?: S & NoInfer<ExactSettings<S>>;
};
