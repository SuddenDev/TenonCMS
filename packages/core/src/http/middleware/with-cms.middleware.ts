import type { MiddlewareHandler } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Env } from "./types.ts";

/**
 * Sets `c.var.cms` to the local API without a user. It runs first, so public plugin middleware and routes get it.
 * @returns The Hono middleware.
 */
export const withCms =
  (core: Core): MiddlewareHandler<Env> =>
  async (c, next) => {
    c.set("cms", core.localApi(outerScope(null)));
    await next();
  };
