import { isObject } from "../schema/condition.ts";
import { filterable, innerFields } from "../schema/walk.ts";
import type { SelectSpec, Spec } from "../cms/populate.ts";
import type { Collection, Field, Fields } from "../schema/index.ts";

/** `public`: a read without a session. `admin`: a request with a session. */
export type Level = "public" | "admin";
export const visible = (f: Field, level: Level) => level === "admin" || !f.private;

/** A tree from dot paths, with `true` at the leaves. A longer path wins over its prefix. Null-prototype nodes, so `__proto__` cannot reach `Object.prototype`. */
function treeOf(paths: string[]): Record<string, any> {
  const tree = Object.create(null);
  for (const path of paths) {
    const keys = path.split(".");
    const leaf = keys.pop()!;
    let node = tree;
    for (const key of keys)
      node = node[key] = isObject(node[key]) ? node[key] : Object.create(null);
    node[leaf] ??= true;
  }
  return tree;
}

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
    if (!inner || hops > maxDepth) return keys.slice(0, i + 1).join(".");
    fields = inner;
  }
}

/** Parses `?populate=` and `?depth=`. Returns the error message for a bad depth, an unknown path, a field that cannot populate or too many hops. */
export function parsePopulate(
  collections: Record<string, Collection>,
  fields: Fields,
  query: { populate?: string; depth?: string },
  config: { depth: number; maxDepth: number },
): Spec | string {
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

/** Parses `?select=`: dot paths, comma-separated. Keys are checked by `badSelectPath()`. */
export function parseSelect(query: string): SelectSpec {
  return treeOf(query.split(",").filter(Boolean));
}

// A query string as the field's type, so `?featured=true` matches a boolean. `null` matches an empty or missing
// field, like `null` in the local API. `undefined`: the value does not fit the type.
function coerce(type: Field["type"], value: string) {
  if (value === "null") return null;
  if (type === "number") {
    const n = value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return value === "true" ? true : value === "false" ? false : undefined;
  return value;
}

// The `where` of a query. An empty value adds no filter. `undefined` for an unknown field, a field the caller
// cannot see or a value that does not fit its type.
export function whereFromQuery(fields: Fields, query: Record<string, string>, level: Level) {
  const where: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!filterable(fields, key) || !visible(fields[key], level)) return undefined;
    if (value === "") continue;
    const typed = coerce(fields[key].type, value);
    if (typed === undefined) return undefined;
    where[key] = typed;
  }
  return where;
}
