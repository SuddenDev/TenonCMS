import type { Context, MiddlewareHandler, Next } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Env } from "../../http/middleware/types.ts";
import { caller } from "../get-caller.ts";

/**
 * Looks up the request's caller once: sets `c.var.cms` and `c.var.perspective` for the session's user, the API key,
 * or neither, plus `c.var.user` with a session and `c.var.apiKey` with a key. Content reads and writes run behind it
 * alone, so their access rules decide.
 * @returns The Hono middleware.
 */
export function optionalSession(core: Core): MiddlewareHandler<Env> {
  return async (c, next) => {
    const visitor = await caller(core, c.req.raw);
    if (visitor.user) c.set("user", visitor.user);
    if (visitor.apiKey) c.set("apiKey", visitor.apiKey);
    c.set("perspective", visitor.perspective);
    c.set("cms", core.localApi(outerScope(visitor)));
    await next();
  };
}

/** Answers 401 without a session or API key. Runs after {@link optionalSession}; `apiKeyReach()` limits a key. */
export async function session(c: Context<Env>, next: Next) {
  if (!c.var.user && !c.var.apiKey) return c.json({ message: "Unauthorized" }, 401);
  await next();
}

/**
 * Runs `mw` only for a request with a session, so plugin `middleware` keeps its signed-in `c.var.user`.
 * @returns The Hono middleware.
 */
export function withSession(mw: MiddlewareHandler<Env>): MiddlewareHandler<Env> {
  return (c, next) => (c.var.user ? mw(c, next) : next());
}
