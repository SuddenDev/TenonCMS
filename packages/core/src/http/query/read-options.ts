import { badSelectPath } from "../../content/population/validate-select.ts";
import type { SelectSpec } from "../../content/population/select-fields.ts";
import type { Collection, Fields } from "../../schema/index.ts";
import { parsePopulate } from "./parse-populate.ts";
import { parseSelect } from "./parse-select.ts";

type ReadOpts = {
  populate?: boolean | Record<string, unknown>;
  depth?: number;
  select?: SelectSpec;
};

/**
 * Parses `?populate=`, `?depth=` and `?select=` into the options of a local read.
 * Pass `doc = false` for globals, which have no `id`, `createdAt` or `updatedAt`.
 * @returns The read options, or the message of a 400.
 */
export function readOptions(
  collections: Record<string, Collection>,
  config: { depth: number; maxDepth: number },
  fields: Fields,
  query: { populate?: string; depth?: string; select?: string },
  doc = true,
): ReadOpts | string {
  const plan = parsePopulate(collections, fields, query, config);
  if (typeof plan === "string") return plan;
  const read: ReadOpts = typeof plan === "number" ? { depth: plan } : { populate: plan };
  if (query.select === undefined) return read;

  const select = parseSelect(query.select);
  const error = badSelectPath(collections, fields, select, plan, "", doc);
  return error ? `Invalid select: ${error}` : { ...read, select };
}
