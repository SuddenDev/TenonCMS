import { Hono } from "hono";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { notFound } from "../../http/errors.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { regenerate } from "../operations/regenerate.operation.ts";
import { body, scope } from "./request-context.ts";

/** Protected `POST /:id/regenerate`. Mounted only for a provider with `render`. */
export function regenerateEndpoints(core: Core) {
  const render = mediaOf(core).images?.provider.render;
  const api = new Hono<Env>();

  if (render)
    api.post("/:id/regenerate", async (c) => {
      const { force } = await body(c.req);
      const result = await regenerate(core, scope(c), c.req.param("id"), { force: force === true });
      if (!result) throw notFound();
      return c.json(result);
    });
  return api;
}
