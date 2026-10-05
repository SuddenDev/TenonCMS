import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { body } from "../../http/parse-body.ts";
import { previewUrl } from "../../preview/server/resolve-url.ts";

export function previewUrlEndpoint(core: Core) {
  const { schema } = core;

  return new Hono<Env>().post("/globals/:name/preview-url", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const entry = schema.globals![name]!;
    if (!entry.preview) throw notFound();
    return c.json({
      url: await previewUrl(entry, await body(c.req), c.var.cms),
    });
  });
}
