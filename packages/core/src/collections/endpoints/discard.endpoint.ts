import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";

export function discardEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().delete("/collections/:name/:id/draft", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const doc = await c.var.cms.discard(name, c.req.param("id"), {
      locale: c.req.query("locale"),
      allowBrokenLinks: c.req.query("allowBrokenLinks") === "true",
      all: c.req.query("all") === "true",
    });

    return doc ? c.json(doc) : c.body(null, 204);
  });
}
