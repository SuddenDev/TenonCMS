import type { User } from "better-auth";
import type { Hono, MiddlewareHandler } from "hono";
import type {
  Collection,
  Global,
  LocalApi,
  MediaHooks,
  RootHooks,
  Schema,
} from "../schema/index.ts";

/** Hono environment of a plugin's {@link Plugin.routes}: the local API bound to the session user, and the user. */
export type RouteEnv = { Variables: { cms: LocalApi; user: User } };
/** Hono environment of a plugin's {@link Plugin.publicRoutes}: the local API without a user. */
export type PublicRouteEnv = { Variables: { cms: LocalApi } };

/**
 * The server half of a plugin. Pass it to `defineCms({ plugins })`.
 *
 * A plugin adds collections, globals and hooks like a host does. Its hooks run for every collection and global,
 * after the collection's or global's own hooks and before the host's root hooks.
 * Routes are mounted under `/api/cms/<name>`. Routes and middleware get core's error mapping: `ValidationError` is 400, `ConflictError` 409.
 */
export type Plugin<
  C extends Record<string, Collection> = Record<string, Collection>,
  G extends Record<string, Global> = Record<string, Global>,
> = {
  /** Unique name, e.g. `redirects`. Lowercase letters, digits and `-`. It prefixes the plugin's routes: `/api/cms/<name>/…`. */
  name: string;
  /** Collections the plugin adds. A name the host or another plugin uses throws at startup. */
  collections?: C;
  /** Globals the plugin adds. A name the host or another plugin uses throws at startup. */
  globals?: G;
  /** Hooks for every collection and global. See {@link RootHooks}. */
  hooks?: RootHooks;
  /** Hooks of the media library. They run after the host's `media.hooks`. See {@link MediaHooks}. */
  mediaHooks?: MediaHooks;
  /**
   * Routes that need a session, for admin pages. Mounted at `/api/cms/<name>`, after CSRF and session checks.
   * `c.var.cms` runs hooks with the session user; `c.var.user` is that user.
   * @example
   * routes: (api) => api.post('/import', async (c) => c.json(await c.var.cms.create('redirects', await c.req.json())))
   */
  routes?: (api: Hono<RouteEnv>) => void;
  /**
   * Routes without a session, for the site or the public. Mounted at `/api/cms/<name>`, before CSRF and session checks.
   * `c.var.cms` has no user. Writes here are unprotected, so these routes SHOULD only read.
   */
  publicRoutes?: (api: Hono<PublicRouteEnv>) => void;
  /**
   * Hono middleware for every request under `/api/cms`, auth routes included, before any route runs.
   * `c.var.cms` has no user. Plugins run in the order of `plugins`. Return a response to stop the request.
   * @example
   * publicMiddleware: async (c, next) => { await next(); c.header("x-powered-by", "integral") }
   */
  publicMiddleware?: MiddlewareHandler<PublicRouteEnv>;
  /**
   * Hono middleware for requests with a session: writes, `/schema` and every plugin's `routes`.
   * Runs after the CSRF and session checks, so `c.var.user` is set and `c.var.cms` runs hooks with that user.
   */
  middleware?: MiddlewareHandler<RouteEnv>;
};

/** Types a plugin. Use it as the return value of the plugin's factory. */
export function definePlugin<
  const C extends Record<string, Collection> = {},
  const G extends Record<string, Global> = {},
>(plugin: Plugin<C, G>) {
  return plugin;
}

// Route prefixes core uses under `/api/cms`.
const reserved = ["auth", "collections", "globals", "schema", "media"];

/** The host's schema with every plugin's collections and globals. Throws for duplicate or invalid names. */
export function mergePlugins(plugins: readonly Plugin[], schema: Schema): Required<Schema> {
  const fail = (message: string) => {
    throw new Error(`integral-cms: ${message}`);
  };
  const collections = { ...schema.collections };
  const globals = { ...schema.globals };
  const names = new Set<string>();
  const own = (name: string) => {
    if (name === "media") fail(`collection name "media" is reserved for the media library`);
  };
  Object.keys(collections).forEach(own);
  for (const plugin of plugins) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name) || reserved.includes(plugin.name))
      fail(`invalid plugin name "${plugin.name}"`);
    if (names.has(plugin.name)) fail(`duplicate plugin "${plugin.name}"`);
    names.add(plugin.name);
    for (const [name, collection] of Object.entries(plugin.collections ?? {})) {
      own(name);
      if (Object.hasOwn(collections, name)) fail(`duplicate collection "${name}"`);
      collections[name] = collection;
    }
    for (const [name, global] of Object.entries(plugin.globals ?? {})) {
      if (Object.hasOwn(globals, name)) fail(`duplicate global "${name}"`);
      globals[name] = global;
    }
  }
  return { collections, globals };
}
