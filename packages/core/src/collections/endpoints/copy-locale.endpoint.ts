import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { parseBody } from "../../http/parse-body.ts";

export function copyLocaleEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().post("/collections/:name/:id/locales/:to/copy", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const body = await parseBody(c.req);
    const doc = await c.var.cms.copyLocale(name, c.req.param("id"), {
      from: body?.from,
      to: c.req.param("to"),
    });
    if (!doc) throw notFound();
    return c.json(doc);
  });
}
