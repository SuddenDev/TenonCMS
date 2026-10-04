import type { User } from "better-auth";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { API_BASE } from "../client/constants.ts";
import type { Cms } from "../cms/create-cms.ts";
import type { Schema } from "../schema/index.ts";
import type { Plugin } from "../plugins/types.ts";
import type { Env } from "./middleware/types.ts";
import { withCms } from "./middleware/with-cms.middleware.ts";
import { session } from "../auth/middleware/session.middleware.ts";
import { providerEndpoint } from "../auth/endpoints/provider.endpoint.ts";
import { pluginMiddleware } from "../plugins/http/collect-middleware.ts";
import { mountRoutes } from "../plugins/http/mount-routes.ts";
import { collectionsRoutes } from "../collections/endpoints/routes.ts";
import { globalsRoutes } from "../globals/endpoints/routes.ts";
import { readEndpoint } from "../schema/endpoints/read.endpoint.ts";
import { enterEndpoint } from "../preview/endpoints/enter.endpoint.ts";
import { exitEndpoint } from "../preview/endpoints/exit.endpoint.ts";
import { handleError } from "./errors.ts";

/**
 * `asUser(user)` returns the local API with the session user set for hooks. `media` holds the media routes, mounted at
 * `/media` when the `media` option is set. `site` goes out in `/schema` for the admin's preview.
 */
export function createApp(
  cms: Cms<Schema>,
  asUser: (user: User) => Cms<Schema>,
  plugins: readonly Plugin[] = [],
  media?: { reads: Hono<Env>; writes: Hono<Env>; regenerate: boolean },
  site?: string,
) {
  const schemaEndpoint = readEndpoint(cms.schema, media, site);
  const collections = collectionsRoutes(cms);
  const globals = globalsRoutes(cms);
  const reads = new Hono<Env>();
  mountRoutes(reads, plugins, "publicRoutes");
  if (media) reads.route("/media", media.reads);
  reads.route("/", collections.reads);
  reads.route("/", globals.reads);

  const writes = new Hono<Env>();
  writes.route("/", schemaEndpoint);
  writes.route("/", enterEndpoint());
  writes.route("/", exitEndpoint());
  mountRoutes(writes, plugins, "routes");
  if (media) writes.route("/media", media.writes);
  writes.route("/", collections.writes);
  writes.route("/", globals.writes);

  const api = new Hono<Env>().basePath(API_BASE);
  api.onError(handleError);
  api.notFound((c) => c.json({ message: "Not Found" }, 404));
  api.use(withCms(cms), ...pluginMiddleware(plugins, "publicMiddleware"));
  api.route("/", providerEndpoint(cms));
  api.route("/", reads);
  api.use(csrf(), session(cms, asUser), ...pluginMiddleware(plugins, "middleware"));
  api.route("/", writes);
  return api;
}
