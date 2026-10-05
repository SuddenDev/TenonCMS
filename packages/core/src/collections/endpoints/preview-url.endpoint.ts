import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { body } from "../../http/parse-body.ts";
import { previewUrl } from "../../preview/server/resolve-url.ts";

export function previewUrlEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};
  return new Hono<Env>().post("/collections/:name/preview-url", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const entry = collections[name]!;
    if (!entry.preview) throw notFound();
    return c.json({
      url: await previewUrl(entry, await body(c.req), c.var.cms),
    });
  });
}
