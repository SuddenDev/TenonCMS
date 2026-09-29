import type { User } from "better-auth";
import { consola } from "consola";
import { createDb, migrate } from "../db/index.ts";
import { createApp } from "../http/index.ts";
import { defaultMedia } from "integral-cms/media/default";
import { mediaRoutes } from "../media/http.ts";
import { createMediaCore, mediaCollection, type MediaOptions } from "../media/index.ts";
import { mergePlugins, type Plugin } from "../plugins/index.ts";
import type { Collection, Global, MediaApi, Schema } from "../schema/index.ts";
import { checkSchema } from "../schema/validate.ts";
import { type Api, bind } from "./api.ts";
import { type AuthOptions, authOptions, createAuth } from "./auth.ts";
import type {
  CmsOptions,
  DefaultDepth,
  PluginCollections,
  PluginGlobals,
  PopulateConfig,
} from "./options.ts";
import type { Core } from "./scope.ts";

export type { Api } from "./api.ts";

/**
 * Creates a CMS instance. Export it as the default export of `integral.config.ts`.
 *
 * The returned object is the local API for server code. Nothing connects until the first call.
 */
export function defineCms<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
  const A extends AuthOptions = {},
  const P extends PopulateConfig = {},
  const PL extends readonly Plugin[] = [],
  const M extends MediaOptions | boolean | undefined = undefined,
>({
  database,
  secret,
  auth: host = {} as A,
  populate: config = {} as P,
  hooks: rootHooks = {},
  plugins = [] as unknown as PL,
  media: mediaOption,
  ...own
}: CmsOptions<C, G, A, P, PL, M>) {
  type T = {
    collections?: C & PluginCollections<PL> & MediaCollections<M>;
    globals?: G & PluginGlobals<PL>;
  };
  type D = DefaultDepth<P>;
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 };
  const schema = mergePlugins(plugins, own);
  const mediaOptions =
    typeof mediaOption === "object"
      ? mediaOption
      : mediaOption !== false
        ? defaultMedia(!!mediaOption)
        : undefined;
  if (mediaOptions) schema.collections.media = mediaCollection;
  checkSchema(schema, defaults);
  const media = mediaOptions && createMediaCore(mediaOptions, schema);
  const count = (o: object) => Object.keys(o).length;
  consola
    .withTag("integral")
    .info(
      `Initialized with ${count(schema.collections)} collection(s), ${count(schema.globals)} global(s)`,
    );

  // Created lazily so no connection opens at import time.
  let ready:
    | Promise<{ db: ReturnType<typeof createDb>; options: ReturnType<typeof authOptions<A>> }>
    | undefined;
  const connect = () =>
    (ready ??= (async () => {
      const db = createDb(database.url, database.authToken);
      const options = authOptions(db, secret, host);
      await migrate(db, options);
      return { db, options };
    })());

  let authInstance: ReturnType<typeof createAuth<ReturnType<typeof authOptions<A>>>> | undefined;
  const auth = async () => {
    if (!secret || secret.length < 32)
      throw new Error("integral-cms: `secret` MUST be at least 32 characters");
    return (authInstance ??= createAuth((await connect()).options));
  };

  const core: Core = {
    schema,
    plugins,
    rootHooks,
    defaults,
    db: async () => (await connect()).db,
    bind: (scope) => bind(core, scope),
    media,
  };
  const api = (user: User | null) =>
    bind(core, { user, context: {}, nested: false }) as unknown as Api<T, D>;
  const cms = {
    schema: schema as unknown as T,
    auth,
    /** The `populate` config with defaults. */
    populate: defaults as { depth: D; maxDepth: number },
    ...api(null),

    /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>;
    },
  };

  const app = createApp(
    cms as unknown as Cms<Schema>,
    (user) => ({ ...cms, ...api(user) }) as unknown as Cms<Schema>,
    plugins,
    media && mediaRoutes(core),
  );
  return cms as typeof cms & MediaOf<M>;
}

// The `media` collection and `cms.media` exist unless `media: false`.
// Not distributive, and `M = never` (options cast `as never`) counts as no media: otherwise TS2589.
type MediaCollections<M> = [M] extends [false] ? unknown : { media: MediaCollection };
// Type only: reads compute `url`, and `src` and `srcset` for images. They are not stored and not filterable.
type MediaCollection = {
  fields: (typeof mediaCollection)["fields"] & {
    url: { type: "text"; required: true };
    src: { type: "text" };
    srcset: { type: "text" };
  };
};
type MediaOf<M> = [M] extends [false] ? {} : { media: MediaApi };

export type Cms<T extends Schema> = ReturnType<
  typeof defineCms<NonNullable<T["collections"]>, NonNullable<T["globals"]>>
>;
