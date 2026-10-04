import type { User } from "better-auth";
import type { MiddlewareHandler } from "hono";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import type { Env } from "../../http/middleware/types.ts";

/** Answers 401 without a session. Otherwise sets `c.var.user` and `c.var.cms` with that user for hooks. */
export const session =
  (cms: Cms<Schema>, asUser: (user: User) => Cms<Schema>): MiddlewareHandler<Env> =>
  async (c, next) => {
    const found = await (await cms.auth()).api.getSession({ headers: c.req.raw.headers });
    if (!found) return c.json({ message: "Unauthorized" }, 401);
    c.set("cms", asUser(found.user));
    c.set("user", found.user);
    await next();
  };
