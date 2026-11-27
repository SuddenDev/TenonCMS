import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { API_BASE } from "../../client/constants.ts";

/** The options of Hono's `cors()`. It is Hono's API and follows Hono's versioning. */
export type CorsOptions = NonNullable<Parameters<typeof cors>[0]>;

// The routes a page of the site calls: the admin bar's, and content. Every other route stays closed to the site,
// so its page code can never read the session token from `/auth` or create an API key or an invite.
const SITE_ROUTES = new RegExp(
  `^${API_BASE}/(admin-bar|admin/load|preview|localization|collections|globals)(/|$)`,
);

/**
 * CORS for pages on another origin, through Hono's `cors()`. It runs only for a request with an `Origin` on one of
 * the routes such a page calls, so every other request passes untouched.
 *
 * The defaults allow the origin of `site.url`, with credentials, `GET` and `POST`, and the one request header
 * `content-type`, so a page never sends an API key. The host's `cors` option replaces them key by key.
 * @param siteOrigin The origin of `site.url`.
 * @param options The `cors` option.
 * @returns The Hono middleware. It does nothing without an origin to allow.
 */
export function siteCors(
  siteOrigin: string | undefined,
  options: CorsOptions = {},
): MiddlewareHandler {
  const origin = options.origin ?? siteOrigin;
  if (!origin) return (_c, next) => next();

  const handler = cors({
    credentials: true,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["content-type"],
    ...options,
    origin,
  });
  return (c, next) =>
    c.req.header("origin") && SITE_ROUTES.test(c.req.path) ? handler(c, next) : next();
}
