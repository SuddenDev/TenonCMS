import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { body } from "../../http/parse-body.ts";

export function updateEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};
  return new Hono<Env>()
    .put("/collections/:name/:id", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      const doc = await c.var.cms.update(name, c.req.param("id"), await body(c.req));
      if (!doc) throw notFound();
      return c.json(doc);
    })
    .put("/collections/:name/:id/draft", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      const doc = await c.var.cms.update(name, c.req.param("id"), await body(c.req), {
        draft: true,
      });
      if (!doc) throw notFound();
      return c.json(doc);
    });
}
