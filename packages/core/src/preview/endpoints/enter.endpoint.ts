import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import { setCookie } from "hono/cookie";
import { PREVIEW_COOKIE } from "../../auth/get-caller.ts";
import { parseBody } from "../../http/parse-body.ts";

export function enterEndpoint() {
  return new Hono<Env>().post("/preview", async (c) => {
    const perspective = (await parseBody(c.req))?.perspective ?? "drafts";
    if (perspective !== "drafts" && perspective !== "published")
      return c.json({ message: 'perspective MUST be "drafts" or "published"' }, 400);
    setCookie(c, PREVIEW_COOKIE, perspective, { sameSite: "Lax", path: "/" });
    return c.body(null, 204);
  });
}
