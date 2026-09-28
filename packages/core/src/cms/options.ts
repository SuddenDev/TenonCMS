import type { AuthOptions } from "./auth.ts";
import type { Plugin } from "../plugins/index.ts";
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

export type CmsOptions<
  C extends Record<string, Collection>,
  G extends Record<string, Global>,
  A extends AuthOptions = {},
  P extends PopulateConfig = {},
  PL extends readonly Plugin[] = [],
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
};
