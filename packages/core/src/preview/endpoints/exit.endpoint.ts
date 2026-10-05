import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import { deleteCookie } from "hono/cookie";
import { PREVIEW_COOKIE } from "../../auth/get-caller.ts";

/** `DELETE /preview` clears the preview cookie, so reads return to the published perspective. */
export function exitEndpoint() {
  return new Hono<Env>().delete("/preview", (c) => {
    deleteCookie(c, PREVIEW_COOKIE, { path: "/" });
    return c.body(null, 204);
  });
}
