import { badSelectPath, metaKeys } from "../../content/population/validate-select.ts";
import type { SelectSpec } from "../../content/population/select-fields.ts";
import type { Collection, Fields } from "../../schema/index.ts";
import { parsePopulate } from "./parse-populate.ts";
import { parseSelect } from "./parse-select.ts";

type ReadOpts = {
  populate?: boolean | Record<string, unknown>;
  depth?: number;
  select?: SelectSpec;
  locale?: string;
  fallback?: boolean;
  alternates?: boolean;
};

// `?name=true|false` as a boolean. `undefined` when missing; `null` for any other value.
function flag(value: string | undefined) {
  if (value === undefined) return undefined;
  return value === "true" ? true : value === "false" ? false : null;
}

/**
 * Parses `?populate=`, `?depth=`, `?select=`, `?locale=`, `?fallback=` and `?alternates=` into the options of a local read.
 * `meta` lists the meta keys of the target, `false` for globals, which have no `id`, `createdAt` or `updatedAt`.
 * @returns The read options, or the message of a 400.
 */
export function readOptions(
  collections: Record<string, Collection>,
  config: { depth: number; maxDepth: number },
  fields: Fields,
  query: {
    populate?: string;
    depth?: string;
    select?: string;
    locale?: string;
    fallback?: string;
    alternates?: string;
  },
  meta: readonly string[] | false = metaKeys(),
): ReadOpts | string {
  const plan = parsePopulate(collections, fields, query, config);
  if (typeof plan === "string") return plan;

  const fallback = flag(query.fallback);
  if (fallback === null) return "Invalid fallback";
  const alternates = flag(query.alternates);
  if (alternates === null) return "Invalid alternates";
  const read: ReadOpts = {
    ...(typeof plan === "number" ? { depth: plan } : { populate: plan }),
    ...(query.locale !== undefined && { locale: query.locale }),
    ...(fallback !== undefined && { fallback }),
    ...(alternates !== undefined && { alternates }),
  };
  if (query.select === undefined) return read;

  const select = parseSelect(query.select);
  const error = badSelectPath(collections, fields, select, plan, "", meta);
  return error ? `Invalid select: ${error}` : { ...read, select };
}
