import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Collection, Schema } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";

export function deleteEndpoint(cms: Cms<Schema>) {
  const collections: Record<string, Collection> = cms.schema.collections ?? {};
  return new Hono<Env>().delete("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    await c.var.cms.delete(name, c.req.param("id"));
    return c.body(null, 204);
  });
}
