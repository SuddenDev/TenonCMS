import { Hono } from "hono";
import { z } from "zod";
import type { Core } from "../../cms/runtime/types.ts";
import { collectionOf } from "../../collections/endpoints/get-target.ts";
import { globalOf } from "../../globals/endpoints/get-target.ts";
import { notFound } from "../../http/errors.ts";
import type { Env } from "../../http/middleware/types.ts";
import { parseBody } from "../../http/parse-body.ts";
import { input } from "../../users/endpoints/input.ts";
import { SCHEDULE_ACTIONS } from "../types.ts";

const body = z.object({
  action: z.enum(SCHEDULE_ACTIONS),
  at: z.string(),
  locale: z.string().optional(),
});

/**
 * Content write routes, behind the `update` rule of the entry.
 * - `POST /collections/:name/:id/schedule`
 * - `POST /globals/:name/schedule`
 *
 * Both take `{ action, at, locale? }` and answer `{ id }`, the id of the job. A document that does not exist answers 404.
 */
export function scheduleEndpoint(core: Core) {
  return new Hono<Env>()
    .post("/collections/:name/:id/schedule", async (c) => {
      const { name } = collectionOf(core.schema.collections, c.req.param("name"));
      const options = input(body, await parseBody(c.req));
      const job = await c.var.cms.schedule(name, c.req.param("id"), options);
      if (!job) throw notFound();

      return c.json(job);
    })
    .post("/globals/:name/schedule", async (c) => {
      const { name } = globalOf(core.schema.globals, c.req.param("name"));
      const options = input(body, await parseBody(c.req));
      return c.json(await c.var.cms.scheduleGlobal(name, options));
    });
}
