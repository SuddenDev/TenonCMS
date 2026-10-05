import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { reader } from "../../http/read-request.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { strip } from "../../http/strip-private-fields.ts";

export function getEndpoint(core: Core) {
  const { schema } = core;
  const collections = schema.collections ?? {};

  return new Hono<Env>().get("/globals/:name", async (c) => {
    const { name, fields } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const read = readOptions(collections, core.populate, fields, c.req.query(), false);
    if (typeof read === "string") return c.json({ message: read }, 400);
    const { level, api } = await reader(core, c.req.raw);
    return c.json(strip(collections, fields, await api.getGlobal(name, read), level));
  });
}
