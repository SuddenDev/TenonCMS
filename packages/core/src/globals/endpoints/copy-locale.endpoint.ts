import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { parseBody } from "../../http/parse-body.ts";

export function copyLocaleEndpoint(core: Core) {
  const { schema } = core;

  return new Hono<Env>().post("/globals/:name/locales/:to/copy", async (c) => {
    const { name } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const body = await parseBody(c.req);
    return c.json(
      await c.var.cms.copyGlobalLocale(name, { from: body?.from, to: c.req.param("to") }),
    );
  });
}
