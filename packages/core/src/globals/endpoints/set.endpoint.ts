import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { globalOf } from "./get-target.ts";
import { body } from "../../http/parse-body.ts";

export function setEndpoint(cms: Cms<Schema>) {
  const { schema } = cms;
  return new Hono<Env>()
    .put("/globals/:name", async (c) => {
      const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
      return c.json(await c.var.cms.setGlobal(name, await body(c.req)));
    })
    .put("/globals/:name/draft", async (c) => {
      const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
      return c.json(await c.var.cms.setGlobal(name, await body(c.req), { draft: true }));
    });
}
