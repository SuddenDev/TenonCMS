import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { API_BASE } from "../client/constants.ts";
import type { Core } from "../cms/runtime/types.ts";
import { mediaRoutes } from "../media/endpoints/routes.ts";
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
 * The Hono app behind `cms.fetch`. Media routes are mounted at `/media` when the `media` option is set.
 * `site` goes out in `/schema` for the admin's preview.
 */
export function createApp(core: Core, site?: string) {
  const { plugins } = core;
  const media = core.media && mediaRoutes(core);
  const schemaEndpoint = readEndpoint(core.schema, media, site);
  const collections = collectionsRoutes(core);
  const globals = globalsRoutes(core);
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
  api.use(withCms(core), ...pluginMiddleware(plugins, "publicMiddleware"));
  api.route("/", providerEndpoint(core));
  api.route("/", reads);
  api.use(csrf(), session(core), ...pluginMiddleware(plugins, "middleware"));
  api.route("/", writes);
  return api;
}
