import { badSelectPath } from "../../content/population/validate-select.ts";
import type { SelectSpec } from "../../content/population/select-fields.ts";
import type { Collection, Fields } from "../../schema/index.ts";
import { parsePopulate } from "./parse-populate.ts";
import { parseSelect } from "./parse-select.ts";

// The read options, or the message of a 400.
// `doc`: false for globals, which have no `id`, `createdAt` or `updatedAt`.
export function readOptions(
  collections: Record<string, Collection>,
  config: { depth: number; maxDepth: number },
  fields: Fields,
  query: { populate?: string; depth?: string; select?: string },
  doc = true,
): ReadOpts | string {
  const spec = parsePopulate(collections, fields, query, config);
  if (typeof spec === "string") return spec;
  const read: ReadOpts = typeof spec === "number" ? { depth: spec } : { populate: spec };
  if (query.select === undefined) return read;
  const select = parseSelect(query.select);
  const error = badSelectPath(collections, fields, select, spec, "", doc);
  return error ? `Invalid select: ${error}` : { ...read, select };
}
type ReadOpts = {
  populate?: boolean | Record<string, unknown>;
  depth?: number;
  select?: SelectSpec;
};
