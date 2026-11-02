import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { parseBody } from "../../http/parse-body.ts";
import { syncChoice } from "../../http/sync-choice.ts";

export function syncStructureEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>()
    .post("/collections/:name/structure/apply", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      const body = await parseBody(c.req);
      return c.json(await c.var.cms.applySyncStructure(name, { dryRun: body?.dryRun === true }));
    })
    .post("/collections/:name/:id/structure", async (c) => {
      const { name } = collectionOf(collections, c.req.param("name"));
      const body = await parseBody(c.req);
      const result = await c.var.cms.setSyncStructure(
        name,
        c.req.param("id"),
        syncChoice(body?.sync),
        {
          locale: body?.locale,
          dryRun: body?.dryRun === true,
        },
      );
      if (!result) throw notFound();
      return c.json(result);
    });
}
