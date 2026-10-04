import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { globalOf } from "./get-target.ts";

export function publishEndpoint(cms: Cms<Schema>) {
  const { schema } = cms;
  return new Hono<Env>().post("/globals/:name/publish", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    return c.json(await c.var.cms.publishGlobal(name));
  });
}
