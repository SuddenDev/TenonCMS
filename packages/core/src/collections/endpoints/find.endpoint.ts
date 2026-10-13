import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import type { Collection } from "../../schema/index.ts";
import { collectionOf } from "./get-target.ts";
import { readRequest } from "../../http/read-request.ts";
import { readOptions } from "../../http/query/read-options.ts";
import { stripPrivateFields } from "../../http/strip-private-fields.ts";
import { metaKeys } from "../../content/population/validate-select.ts";
import { whereFromQuery } from "../../http/query/where-from-query.ts";

export function findEndpoint(core: Core) {
  const collections: Record<string, Collection> = core.schema.collections ?? {};

  return new Hono<Env>().get("/collections/:name", async (c) => {
    const { name, fields } = collectionOf(collections, c.req.param("name"));
    const { limit, populate, depth, select, locale, fallback, alternates, ...query } =
      c.req.query();
    const { visibility, api } = await readRequest(core, c.req.raw);

    const where = whereFromQuery(fields, query, visibility);
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
    const docs = await api.find(name, { where, limit: limit ? Number(limit) : undefined, ...read });

    return c.json(stripPrivateFields(collections, fields, docs, visibility));
  });
}
