import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { metaKeys } from "../../content/population/validate-select.ts";
import { whereFromQuery } from "../../http/query/where-from-query.ts";

/**
 * `GET /collections/:name`: the documents the caller MAY read, with equality filters from the query.
 * @returns The route. A bad filter, limit or read option answers 400.
 */
export function findEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().get("/collections/:name", async (c) => {
    const { name, fields } = collectionOf(collections, c.req.param("name"));
    const { limit, populate, depth, select, locale, fallback, alternates, ...query } =
      c.req.query();

    const where = whereFromQuery(fields, query);
    if (!where) return c.json({ message: "Invalid filter" }, 400);

    if (limit !== undefined && !/^[1-9]\d*$/.test(limit))
      return c.json({ message: "Invalid limit" }, 400);

    const read = readOptions(
      collections,
      core.populate,
      fields,
      {
        populate,
        depth,
        select,
        locale,
        fallback,
        alternates,
      },
      metaKeys(collections[name].localized),
    );
    if (typeof read === "string") return c.json({ message: read }, 400);
    const docs = await c.var.cms.find(name, {
      where,
      limit: limit ? Number(limit) : undefined,
      ...read,
    });

    return c.json(docs);
  });
}
