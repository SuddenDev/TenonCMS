import { filterable } from "../../schema/traversal/filterable.ts";
import type { Field, Fields } from "../../schema/index.ts";

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

/**
 * Builds the `where` of a find from the query string. An empty value adds no filter. `createdBy` and `updatedBy`
 * filter by user id. The local API checks what the caller MAY filter on.
 * @returns The equality filters, or `undefined` for an unknown field or a value that does not fit its type.
 */
export function whereFromQuery(fields: Fields, query: Record<string, string>) {
  const where: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(query)) {
    const author = key === "createdBy" || key === "updatedBy";
    if (!author && !filterable(fields, key)) return undefined;
    if (value === "") continue;

    const typed = coerce(author ? "text" : fields[key].type, value);
    if (typed === undefined) return undefined;
    where[key] = typed;
  }
  return where;
}
