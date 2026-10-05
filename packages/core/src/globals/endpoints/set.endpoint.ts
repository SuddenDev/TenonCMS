import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { parseBody } from "../../http/parse-body.ts";

export function setEndpoint(core: Core) {
  const { schema } = core;

  return new Hono<Env>()
    .put("/globals/:name", async (c) => {
      const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
      return c.json(await c.var.cms.setGlobal(name, await parseBody(c.req)));
    })
    .put("/globals/:name/draft", async (c) => {
      const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
      return c.json(await c.var.cms.setGlobal(name, await parseBody(c.req), { draft: true }));
    });
}
