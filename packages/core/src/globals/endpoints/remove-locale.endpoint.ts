import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";

export function removeLocaleEndpoint(core: Core) {
  const { schema } = core;

  return new Hono<Env>().delete("/globals/:name/locales/:locale", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    return c.json(await c.var.cms.removeGlobalLocale(name, c.req.param("locale")));
  });
}
