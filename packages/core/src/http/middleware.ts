import type { User } from "better-auth";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Cms } from "../index.ts";
import type { Plugin } from "../plugins/index.ts";
import type { Schema } from "../schema/index.ts";

export type Env = { Variables: { cms: Cms<Schema>; user: User } };

export const notFound = () => new HTTPException(404, { message: "Not Found" });

/** Sets `c.var.cms` to the local API without a user. */
export const withCms =
  (cms: Cms<Schema>): MiddlewareHandler<Env> =>
  async (c, next) => {
    c.set("cms", cms);
    await next();
  };

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

/** The plugins' middleware of one kind, in plugin order. */
export const pluginMiddleware = (
  plugins: readonly Plugin[],
  kind: "middleware" | "publicMiddleware",
) => plugins.flatMap((p) => p[kind] ?? []) as unknown as MiddlewareHandler<Env>[];
