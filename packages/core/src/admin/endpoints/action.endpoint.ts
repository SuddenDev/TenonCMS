import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { runAction } from "../actions/run-action.ts";

/**
 * `POST /admin/actions/:key` runs one admin action for the signed-in user and answers `{ message }`, with status 500
 * when `run` threw. Mount it behind the session middleware.
 */
export function actionEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/actions/:key", async (c) => {
    const { message, failed } = await runAction(core, c.var.user, c.var.cms, c.req.param("key"));
    return c.json({ message }, failed ? 500 : 200);
  });
}
