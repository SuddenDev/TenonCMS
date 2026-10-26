import { Hono } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import type { Env } from "../../http/middleware/types.ts";
import { loadRequest } from "../load/load-request.ts";
import { load } from "../load/load.operation.ts";

/**
 * `POST /admin/load` runs one admin loader for the signed-in user and answers `{ data }` (field, page) or
 * `{ item }` (bar item). The body is a {@link loadRequest}. Mount it behind the session middleware.
 *
 * The loader reads with the request's `cms`, in the perspective of the preview cookie.
 * A body that fails validation answers 400 and runs no loader.
 */
export function loadEndpoint(core: Core) {
  return new Hono<Env>().post("/admin/load", async (c) => {
    const parsed = loadRequest.safeParse(await parseBody(c.req));
    if (!parsed.success) return c.json({ message: z.prettifyError(parsed.error) }, 400);

    return c.json(await load(core, parsed.data, c.var.user, c.var.cms));
  });
}
