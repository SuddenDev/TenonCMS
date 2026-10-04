import type { User } from "better-auth";
import { consola } from "consola";
import { createDb } from "../db/create-db.ts";
import { migrate } from "../db/migrations/migrate.ts";
import { createApp } from "../http/index.ts";
import { caller } from "../auth/get-caller.ts";
import { defaultMedia } from "integral-cms/media/default";
import { mediaRoutes } from "../media/endpoints/routes.ts";
import { createMediaCore } from "../media/runtime/create-media-core.ts";
import { mediaCollection } from "../media/config/collection.ts";
import type { MediaOptions } from "../media/config/options.ts";
import { mergePlugins, type Plugin } from "../plugins/index.ts";
import type { Collection, Global, MediaApi, Schema } from "../schema/index.ts";
import { checkSchema } from "../schema/validation/check-schema.ts";
import type { Api } from "./api/types.ts";
import { bind } from "./api/bind-api.ts";
import type { AuthOptions } from "../auth/config/options.ts";
import { authOptions } from "../auth/config/build-options.ts";
import { createAuth } from "../auth/create-auth.ts";
import { addSettings } from "./config/add-settings.ts";
import type {
  CmsOptions,
  DefaultDepth,
  PluginCollections,
  PluginGlobals,
  PopulateConfig,
  SettingsGlobals,
  SettingsOption,
} from "./config/options.ts";
import type { Core } from "./runtime/types.ts";

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
  const S extends false | SettingsOption | undefined = undefined,
>({
  database,
  secret,
  auth: host = {} as A,
  populate: config = {} as P,
  hooks: rootHooks = {},
  plugins = [] as unknown as PL,
  media: mediaOption,
  settings: settingsOption,
  site,
  ...own
}: CmsOptions<C, G, A, P, PL, M, S>) {
  type T = {
    collections?: C & PluginCollections<PL> & MediaCollections<M>;
    globals?: G & PluginGlobals<PL> & SettingsGlobals<S>;
  };
  type D = DefaultDepth<P>;
  if (site !== undefined && !/^https?:$/.test(URL.parse(site)?.protocol ?? ""))
    throw new Error("integral-cms: `site` MUST be an http(s) URL");
  const defaults = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 };
  const mediaOptions =
    typeof mediaOption === "object"
      ? mediaOption
      : mediaOption !== false
        ? defaultMedia(!!mediaOption)
        : undefined;
  const schema = addSettings(mergePlugins(plugins, own), settingsOption, !!mediaOptions);
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

  // The session of a request. `A` hides `getSession` from the type checker, so it is typed here.
  const getSession = async (headers: Headers) =>
    ((await auth()).api as unknown as Session).getSession({ headers });

  const core: Core = {
    schema,
    plugins,
    rootHooks,
    defaults,
    db: async () => (await connect()).db,
    bind: (scope) => bind(core, scope),
    media,
  };
  const api = (user: User | null, drafts = false) =>
    bind(core, { user, context: {}, nested: false, drafts }) as unknown as Api<T, D>;
  // The instance with the local API of `user` in one perspective. Its `drafts()` keeps the user.
  const scoped = (user: User | null, drafts: boolean): typeof cms =>
    ({ ...cms, ...api(user, drafts), drafts: () => scoped(user, true) }) as typeof cms;
  const cms = {
    schema: schema as unknown as T,
    auth,
    /** The `populate` config with defaults. */
    populate: defaults as { depth: D; maxDepth: number },
    ...api(null),

    /**
     * The same instance in the drafts perspective: reads see documents that were never published, and pending drafts
     * instead of the published data.
     */
    drafts<S>(this: S): S {
      return scoped(null, true) as S;
    },

    /**
     * The instance for the user of `request`'s session, for server-rendered pages. Reads use the drafts perspective
     * when the request carries the preview cookie and a valid session. Looks up the session only when a cookie is sent.
     * @example
     * const cms = await integral.forRequest(request)
     */
    async forRequest<S>(this: S, request: Request): Promise<S> {
      const { user, drafts } = await caller(getSession, request);
      return scoped(user, drafts) as S;
    },

    /** Handles `/api/cms` requests. Mount it in any framework that speaks Request/Response. */
    fetch(request: Request): Promise<Response> {
      return app.fetch(request) as Promise<Response>;
    },
  };

  const app = createApp(
    cms as unknown as Cms<Schema>,
    (user) => scoped(user, false) as unknown as Cms<Schema>,
    plugins,
    media && mediaRoutes(core),
    site,
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

type Session = {
  getSession(context: { headers: Headers }): Promise<{ user: User } | null>;
};

// `T` already holds the settings globals, so `S` is `false`.
export type Cms<T extends Schema> = ReturnType<
  typeof defineCms<
    NonNullable<T["collections"]>,
    NonNullable<T["globals"]>,
    {},
    {},
    [],
    undefined,
    false
  >
>;
