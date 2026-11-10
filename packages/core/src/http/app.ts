import { linkResolveEndpoint } from "../links/endpoints/resolve.endpoint.ts";
import { linkSearchEndpoint } from "../links/endpoints/search.endpoint.ts";
import { adminBrand } from "../admin/merge/merge-options.ts";
import { Hono } from "hono";
import { API_BASE } from "../client/constants.ts";
import type { Core } from "../cms/runtime/types.ts";
import { mediaRoutes } from "../media/endpoints/routes.ts";
import type { Env } from "./middleware/types.ts";
import { withCms } from "./middleware/with-cms.middleware.ts";
import { optionalSession, session, withSession } from "../auth/middleware/session.middleware.ts";
import { providerEndpoint } from "../auth/endpoints/provider.endpoint.ts";
import { statusEndpoint } from "../auth/endpoints/status.endpoint.ts";
import { passwordEndpoint } from "../auth/endpoints/password.endpoint.ts";
import { acceptEndpoint } from "../users/endpoints/accept.endpoint.ts";
import { invitesEndpoint } from "../users/endpoints/invites.endpoint.ts";
import { sessionHint } from "../auth/middleware/session-hint.middleware.ts";
import { apiKeyReach, csrfUnlessApiKey } from "../auth/middleware/api-key.middleware.ts";
import { apiKeysEndpoint } from "../api-keys/endpoints/api-keys.endpoint.ts";
import { locksEndpoint } from "../locks/endpoints/locks.endpoint.ts";
import { versionsEndpoint } from "../versions/endpoints/versions.endpoint.ts";
import { pluginMiddleware } from "../plugins/http/collect-middleware.ts";
import { mountRoutes } from "../plugins/http/mount-routes.ts";
import { collectionsRoutes } from "../collections/endpoints/routes.ts";
import { globalsRoutes } from "../globals/endpoints/routes.ts";
import { readEndpoint } from "../schema/endpoints/read.endpoint.ts";
import { localizationEndpoint } from "../schema/endpoints/localization.endpoint.ts";
import { enterEndpoint } from "../preview/endpoints/enter.endpoint.ts";
import { exitEndpoint } from "../preview/endpoints/exit.endpoint.ts";
import { adminBarEndpoint } from "../preview/endpoints/admin-bar.endpoint.ts";
import { loadEndpoint } from "../admin/endpoints/load.endpoint.ts";
import { noStore } from "./middleware/no-store.middleware.ts";
import { handleError } from "./errors.ts";
import { withPermissions } from "../access/permissions.ts";
import { seoRoutes } from "../seo/endpoints/routes.ts";
import { jobsEndpoint } from "../jobs/endpoints/jobs.endpoint.ts";
import { runEndpoint } from "../jobs/endpoints/run.endpoint.ts";
import { scheduleEndpoint } from "../schedule/endpoints/schedule.endpoint.ts";

/**
 * Builds the Hono app behind `cms.fetch`. Open routes mount first and look up no caller. Then `optionalSession` looks
 * up the caller once for everything below it: content reads, then content writes (collections, globals, media) after
 * the plugins' `middleware`, both behind their access rules, and last the routes that need a session. Media routes
 * mount at `/media` when the `media` option is set. `site` goes out in `/schema` for the admin's preview.
 * `/sitemap.xml` and `/robots.txt` sit at the root, outside `API_BASE`.
 * @returns The app.
 */
export function createApp(core: Core, site?: string) {
  const { plugins } = core;
  const media = core.media && mediaRoutes(core);
  const schemaEndpoint = readEndpoint(core.schema, {
    media,
    site,
    admin: core.admin.descriptor,
    localization: core.localization,
    roles: core.roles,
    email: !!core.emailTemplates,
    permissions: (json, visitor) => withPermissions(core, json, visitor),
  });
  const collections = collectionsRoutes(core);
  const globals = globalsRoutes(core);

  // Media files look up the caller only when a read rule exists, because pages load many of them.
  const open = new Hono<Env>().get("/admin-brand", (c) =>
    c.json(adminBrand(core.admin.descriptor)),
  );
  open.route("/", statusEndpoint(core));
  open.route("/", acceptEndpoint(core));
  open.route("/", localizationEndpoint(core.localization));
  mountRoutes(open, plugins, "publicRoutes");
  if (core.jobs.secret) open.route("/", runEndpoint(core, core.jobs.secret));
  if (media) open.route("/media", media.files);

  const reads = new Hono<Env>();
  if (media) reads.route("/media", media.reads);
  reads.route("/", collections.reads);
  reads.route("/", globals.reads);

  const writes = new Hono<Env>();
  if (media) writes.route("/media", media.writes);
  writes.route("/", collections.writes);
  writes.route("/", globals.writes);
  writes.route("/", scheduleEndpoint(core));

  const signedIn = new Hono<Env>();
  signedIn.route("/", schemaEndpoint);
  signedIn.route("/", enterEndpoint());
  signedIn.route("/", exitEndpoint());
  if (core.admin.bar) signedIn.route("/", adminBarEndpoint(core, core.admin.bar));
  signedIn.route("/", passwordEndpoint(core));
  signedIn.route("/", invitesEndpoint(core, site));
  signedIn.route("/", apiKeysEndpoint(core));
  signedIn.route("/", locksEndpoint(core));
  signedIn.route("/", versionsEndpoint(core));
  signedIn.route("/", jobsEndpoint(core));
  signedIn.route("/", loadEndpoint(core));
  signedIn.route("/", linkSearchEndpoint(core));
  signedIn.route("/", linkResolveEndpoint(core));
  mountRoutes(signedIn, plugins, "routes");
  signedIn.route("/", collections.previews);
  signedIn.route("/", globals.previews);

  const api = new Hono<Env>().basePath(API_BASE);
  api.onError(handleError);
  api.notFound((c) => c.json({ message: "Not Found" }, 404));

  api.use(withCms(core), ...pluginMiddleware(plugins, "publicMiddleware"));
  api.use("/auth/*", sessionHint(core));
  api.use("/invites/accept", sessionHint(core));
  // Invite responses hold tokens, a created or rolled API key its secret.
  api.use("/invites", noStore);
  api.use("/invites/*", noStore);
  api.use("/api-keys", noStore);
  api.use("/api-keys/*", noStore);
  api.route("/", providerEndpoint(core));
  api.route("/", open);

  api.use("/admin/*", noStore);
  api.use("/admin-bar", noStore);
  api.use("/jobs", noStore);
  api.use("/jobs/*", noStore);
  // CSRF lets reads through.
  api.use(csrfUnlessApiKey(), optionalSession(core));
  api.route("/", reads);
  // `use()` MUST get a path when the list MAY be empty.
  api.use("*", ...pluginMiddleware(plugins, "middleware").map(withSession));
  api.route("/", writes);
  api.use(session, apiKeyReach());
  api.route("/", signedIn);

  const app = new Hono<Env>();
  app.onError(handleError);
  app.notFound((c) => c.json({ message: "Not Found" }, 404));
  app.route("/", seoRoutes(core, site));
  app.route("/", api);
  return app;
}
