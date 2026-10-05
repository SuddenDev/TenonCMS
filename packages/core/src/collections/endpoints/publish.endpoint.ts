import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";

export function publishEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};
  return new Hono<Env>().post("/collections/:name/:id/publish", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const doc = await c.var.cms.publish(name, c.req.param("id"));
    if (!doc) throw notFound();
    return c.json(doc);
  });
}
