import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { globalOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { body } from "../../http/parse-body.ts";
import { previewUrl } from "../../preview/server/resolve-url.ts";
import type { LocalApi } from "../../schema/index.ts";

export function previewUrlEndpoint(cms: Cms<Schema>) {
  const { schema } = cms;
  return new Hono<Env>().post("/globals/:name/preview-url", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const entry = schema.globals![name]!;
    if (!entry.preview) throw notFound();
    return c.json({
      url: await previewUrl(entry, await body(c.req), c.var.cms as unknown as LocalApi),
    });
  });
}
