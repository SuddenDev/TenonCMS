import type { MiddlewareHandler } from "hono";
import type { Env } from "./types.ts";

/**
 * Answers 415 unless the body is JSON. Open routes that sign a visitor in run before the CSRF check. A cross-site
 * request with this type needs a preflight, which fails, so another site cannot sign a visitor in to an account of
 * its choosing.
 */
export const jsonOnly: MiddlewareHandler<Env> = async (c, next) => {
  if (!c.req.header("content-type")?.startsWith("application/json"))
    return c.json({ message: "Unsupported Media Type" }, 415);
  await next();
};
