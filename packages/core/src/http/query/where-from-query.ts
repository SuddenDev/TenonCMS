import { filterable } from "../../schema/traversal/filterable.ts";
import type { Field, Fields } from "../../schema/index.ts";
import { visible, type Level } from "./visibility.ts";

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
