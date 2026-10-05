import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { reader } from "../../http/read-request.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { strip } from "../../http/strip-private-fields.ts";
import { notFound } from "../../http/errors.ts";

export function findByIdEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};
  return new Hono<Env>().get("/collections/:name/:id", async (c) => {
    const { name, fields } = collectionOf(collections, c.req.param("name"));
    const read = readOptions(collections, core.populate, fields, c.req.query());
    if (typeof read === "string") return c.json({ message: read }, 400);
    const { level, api } = await reader(core, c.req.raw);
    const doc = await api.findById(name, c.req.param("id"), read);
    if (!doc) throw notFound();
    return c.json(strip(collections, fields, doc, level));
  });
}
