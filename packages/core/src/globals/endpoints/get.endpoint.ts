import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { globalOf } from "./get-target.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { globalMetaKeys } from "../../content/population/validate-select.ts";

/**
 * `GET /globals/:name`, within the global's read rule.
 * @returns The route. A bad read option answers 400.
 */
export function getEndpoint(core: Core) {
  const { schema } = core;
  const collections = schema.collections ?? {};

  return new Hono<Env>().get("/globals/:name", async (c) => {
    const { name, fields } = globalOf(schema.globals ?? {}, c.req.param("name"));
    const read = readOptions(
      collections,
      core.populate,
      fields,
      c.req.query(),
      globalMetaKeys(schema.globals![name]!.localized),
    );
    if (typeof read === "string") return c.json({ message: read }, 400);
    return c.json(await c.var.cms.getGlobal(name, read));
  });
}
