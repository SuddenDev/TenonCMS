import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";

export function deleteEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().delete("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    await c.var.cms.delete(name, c.req.param("id"));
    return c.body(null, 204);
  });
}
