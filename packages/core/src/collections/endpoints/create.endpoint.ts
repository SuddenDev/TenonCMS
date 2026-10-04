import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Collection, Schema } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { body } from "../../http/parse-body.ts";

export function createEndpoint(cms: Cms<Schema>) {
  const collections: Record<string, Collection> = cms.schema.collections ?? {};
  return new Hono<Env>()
    .post("/collections/:name", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      return c.json(await c.var.cms.create(name, await body(c.req)), 201);
    })
    .post("/collections/:name/draft", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      return c.json(await c.var.cms.create(name, await body(c.req), { draft: true }), 201);
    });
}
