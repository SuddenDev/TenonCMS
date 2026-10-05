import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { isRef } from "../../schema/traversal/reference-fields.ts";
import type { Collection, Fields } from "../../schema/index.ts";
import type { PopulatePlan } from "../../content/population/populate-plan.ts";
import { treeOf } from "./path-tree.ts";

// The prefix of `path` up to the first key that is not a group, relation or join, or the hop above `maxDepth`.
function badPopulatePath(
  collections: Record<string, Collection>,
  fields: Fields,
  path: string,
  maxDepth: number,
): string | undefined {
  const keys = path.split(".");
  let hops = 0;
  for (const [i, key] of keys.entries()) {
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    const inner = field && innerFields(collections, field);
    if (field?.type !== "group") hops++;
    // `image` and `file` resolve but end the path.
    const leaf = field && isRef(field) && i === keys.length - 1;
    if ((!inner && !leaf) || hops > maxDepth) return keys.slice(0, i + 1).join(".");
    if (inner) fields = inner;
  }
}

/** Parses `?populate=` and `?depth=`. Returns the error message for a bad depth, an unknown path, a field that cannot populate or too many hops. */
export function parsePopulate(
  collections: Record<string, Collection>,
  fields: Fields,
  query: { populate?: string; depth?: string },
  config: { depth: number; maxDepth: number },
): PopulatePlan | string {
  const depth = query.depth === undefined ? config.depth : Number(query.depth);
  if (query.depth !== undefined && (!/^\d+$/.test(query.depth) || depth > config.maxDepth))
    return `Invalid depth: ${query.depth}`;
  if (query.populate === undefined) return depth;
  if (query.populate === "false") return false;
  const paths = query.populate.split(",");
  for (const path of paths) {
    const bad = badPopulatePath(collections, fields, path, config.maxDepth);
    if (bad !== undefined) return `Invalid populate: ${bad}`;
  }
  return treeOf(paths);
}
