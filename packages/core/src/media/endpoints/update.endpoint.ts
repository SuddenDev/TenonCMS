import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { update } from "../operations/update.operation.ts";
import { body, scope } from "./request-context.ts";

export function updateEndpoints(core: Core) {
  const api = new Hono<Env>();
  api.patch("/:id", async (c) => {
    const { alt, filename, folder } = await body(c.req);
    const doc = await update(core, scope(c), c.req.param("id"), { alt, filename, folder });
    if (!doc) throw notFound();
    return c.json(doc);
  });
  return api;
}
