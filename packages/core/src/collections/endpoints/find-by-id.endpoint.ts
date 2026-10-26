import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { metaKeys } from "../../content/population/validate-select.ts";
import { notFound } from "../../http/errors.ts";

/**
 * `GET /collections/:name/:id`, within the collection's read rule.
 * @returns The route. A missing document, or one outside the rule's `where`, answers 404.
 */
export function findByIdEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().get("/collections/:name/:id", async (c) => {
    const { name } = collectionOf(collections, c.req.param("name"));
    const read = readOptions(
      collections,
      core.populate,
      collections[name].fields,
      c.req.query(),
      metaKeys(collections[name].localized),
    );
    if (typeof read === "string") return c.json({ message: read }, 400);

    const doc = await c.var.cms.findById(name, c.req.param("id"), read);
    if (!doc) throw notFound();

    return c.json(doc);
  });
}
