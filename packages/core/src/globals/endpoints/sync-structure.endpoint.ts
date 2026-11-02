import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { notFound } from "../../http/errors.ts";
import { parseBody } from "../../http/parse-body.ts";
import { syncChoice } from "../../http/sync-choice.ts";

export function syncStructureEndpoint(core: Core) {
  const { schema } = core;

  return new Hono<Env>().post("/globals/:name/structure", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const body = await parseBody(c.req);
    const result = await c.var.cms.setGlobalSyncStructure(name, syncChoice(body?.sync), {
      locale: body?.locale,
      dryRun: body?.dryRun === true,
    });
    if (!result) throw notFound();
    return c.json(result);
  });
}
