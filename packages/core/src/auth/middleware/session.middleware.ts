import type { MiddlewareHandler } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Env } from "../../http/middleware/types.ts";

/** Answers 401 without a session. Otherwise sets `c.var.user` and `c.var.cms` with that user for hooks. */
export const session =
  (core: Core): MiddlewareHandler<Env> =>
  async (c, next) => {
    const found = await core.getSession(c.req.raw.headers);
    if (!found) return c.json({ message: "Unauthorized" }, 401);
    c.set("cms", core.localApi(outerScope(found.user)));
    c.set("user", found.user);
    await next();
  };
