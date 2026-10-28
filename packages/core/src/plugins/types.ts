import type { CmsUser, PluginAdminOptions } from "../admin/index.d.ts";
import type { Hono, MiddlewareHandler } from "hono";
import type { Collection, Global, LocalApi, MediaHooks, RootHooks } from "../schema/index.ts";

/** Hono environment of a plugin's {@link Plugin.routes}: the local API bound to the session user, and the user. */
export type RouteEnv = { Variables: { cms: LocalApi; user: CmsUser } };
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
   * Routes that need a session, for admin pages. Mounted at `/api/cms/<name>`, after CSRF and session checks. API keys
   * get 403. `c.var.cms` runs hooks with the session user; `c.var.user` is that user.
   * @example
   * routes: (api) => api.post('/import', async (c) => c.json(await c.var.cms.create('redirects', await c.req.json())))
   */
  routes?: (api: Hono<RouteEnv>) => void;
  /**
   * Routes without a session, for the site or the public. Mounted at `/api/cms/<name>`, before CSRF and session checks.
   * `c.var.cms` has no user, so the access rules deny writes unless a rule allows callers without one.
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
   * Hono middleware for requests with a session: content writes, `/schema` and every plugin's `routes`. Writes
   * without a session skip it, API key writes included.
   * Runs after the CSRF and session checks, so `c.var.user` is set and `c.var.cms` runs hooks with that user.
   */
  middleware?: MiddlewareHandler<RouteEnv>;
  /**
   * Custom fields, pages and admin bar items of the plugin, like the host's `admin`. A plugin sets neither the
   * bar's position nor `adminBar: false`. Plugins merge in the order of `plugins`, before the host.
   */
  admin?: PluginAdminOptions;
};
