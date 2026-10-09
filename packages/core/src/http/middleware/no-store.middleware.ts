import type { MiddlewareHandler } from "hono";

/** Sets `Cache-Control: no-store` on every response of the routes it covers, errors included. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};
