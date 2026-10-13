import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { parseBody } from "../../http/parse-body.ts";

export function createEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>()
    .post("/collections/:name", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      return c.json(
        await c.var.cms.create(name, await parseBody(c.req), { locale: c.req.query("locale") }),
        201,
      );
    })
    .post("/collections/:name/draft", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      return c.json(
        await c.var.cms.create(name, await parseBody(c.req), {
          draft: true,
          locale: c.req.query("locale"),
        }),
        201,
      );
    });
}
