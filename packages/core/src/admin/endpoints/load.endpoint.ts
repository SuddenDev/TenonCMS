import { Hono } from "hono";
import { z } from "zod";
import { caller } from "../../auth/get-caller.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import type { Env } from "../../http/middleware/types.ts";
import { loadRequest } from "../load/load-request.ts";
import { load } from "../load/load.operation.ts";

/**
 * `POST /admin/load` runs one admin loader for the signed-in user and answers `{ data }` (field, page) or
 * `{ item }` (bar item). The body is a {@link loadRequest}. Mount it behind the session middleware.
 *
 * The loader reads with the user's perspective: drafts only with a session and the preview cookie set to `drafts`.
 * A body that fails validation answers 400 and runs no loader.
 */
export function loadEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/load", async (c) => {
    const parsed = loadRequest.safeParse(await parseBody(c.req));
    if (!parsed.success) return c.json({ message: z.prettifyError(parsed.error) }, 400);

    const { user, perspective } = await caller(core.getSession, c.req.raw);
    if (!user) return c.json({ message: "Unauthorized" }, 401);
    const cms = core.localApi(outerScope(user, perspective));
    return c.json(await load(core, parsed.data, user, cms));
  });
}
