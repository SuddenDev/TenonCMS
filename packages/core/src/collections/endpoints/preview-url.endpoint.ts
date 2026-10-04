import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Collection, Schema } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { body } from "../../http/parse-body.ts";
import { previewUrl } from "../../preview/server/resolve-url.ts";
import type { LocalApi } from "../../schema/index.ts";

export function previewUrlEndpoint(cms: Cms<Schema>) {
  const collections: Record<string, Collection> = cms.schema.collections ?? {};
  return new Hono<Env>().post("/collections/:name/preview-url", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const entry = collections[name]!;
    if (!entry.preview) throw notFound();
    return c.json({
      url: await previewUrl(entry, await body(c.req), c.var.cms as unknown as LocalApi),
    });
  });
}
