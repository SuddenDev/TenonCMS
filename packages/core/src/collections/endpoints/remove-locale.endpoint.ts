import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";

export function removeLocaleEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().delete("/collections/:name/:id/locales/:locale", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const doc = await c.var.cms.removeLocale(name, c.req.param("id"), c.req.param("locale"));
    if (!doc) throw notFound();
    return c.json(doc);
  });
}
