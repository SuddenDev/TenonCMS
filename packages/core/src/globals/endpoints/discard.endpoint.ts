import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { globalOf } from "./get-target.ts";

export function discardEndpoint(cms: Cms<Schema>) {
  const { schema } = cms;
  return new Hono<Env>().delete("/globals/:name/draft", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    return c.json(await c.var.cms.discardGlobal(name));
  });
}
