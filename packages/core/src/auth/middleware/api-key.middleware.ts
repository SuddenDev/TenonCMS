import type { MiddlewareHandler } from "hono";
import { csrf } from "hono/csrf";
import { API_BASE, API_KEY_HEADER } from "../../client/constants.ts";
import type { Env } from "../../http/middleware/types.ts";

/**
 * Hono's CSRF check, skipped for a request with an API key: a cross-site form cannot set the header, and a
 * cross-origin `fetch` with it needs a preflight, which fails without CORS headers. Server-side callers send no
 * `Origin`, so the check would refuse them.
 * @returns The Hono middleware.
 */
export function csrfUnlessApiKey(): MiddlewareHandler<Env> {
  const check = csrf();
  return (c, next) => (c.req.header(API_KEY_HEADER) ? next() : check(c, next));
}

/**
 * Limits API key callers on the routes behind `session` to `/schema`, with `read` on `schema`. Every other route there
 * answers 403 to a key, so a key never reaches users, invites, passwords, previews, other keys or the plugins'
 * `routes`, whose handlers expect `c.var.user`. Session callers pass.
 * @returns The Hono middleware.
 */
export function apiKeyReach(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const key = c.var.apiKey;
    if (!key) return next();
    if (c.req.path !== `${API_BASE}/schema` || !key.permissions.schema?.includes("read"))
      return c.json({ message: "Forbidden" }, 403);
    await next();
  };
}
