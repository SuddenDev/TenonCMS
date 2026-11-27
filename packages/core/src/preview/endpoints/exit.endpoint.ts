import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import { deleteCookie } from "hono/cookie";
import type { Core } from "../../cms/runtime/types.ts";
import { cookieDomain } from "../../auth/cookie-domain.ts";
import { PREVIEW_COOKIE } from "../../auth/get-caller.ts";

/** `DELETE /preview` clears the preview cookie, so reads return to the published perspective. */
export function exitEndpoint(core: Core) {
  return new Hono<Env>().delete("/preview", async (c) => {
    deleteCookie(c, PREVIEW_COOKIE, { path: "/", domain: await cookieDomain(core) });
    return c.body(null, 204);
  });
}
