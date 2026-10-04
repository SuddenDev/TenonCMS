import type { MiddlewareHandler } from "hono";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import type { Env } from "./types.ts";

/** Sets `c.var.cms` to the local API without a user. */
export const withCms =
  (cms: Cms<Schema>): MiddlewareHandler<Env> =>
  async (c, next) => {
    c.set("cms", cms);
    await next();
  };
