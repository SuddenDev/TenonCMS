import { innerFields } from "../schema/traversal/inner-fields.ts";
import { mapValue } from "../schema/traversal/map-value.ts";
import type { Collection, Fields } from "../schema/index.ts";
import { visible, type Level } from "./query/visibility.ts";

// Removes fields the caller cannot see, also in groups, populated relations and joins.
export function strip(
  collections: Record<string, Collection>,
  fields: Fields,
  doc: unknown,
  level: Level,
): unknown {
  return mapValue(doc, (d) => {
    const out = { ...d };
    for (const [key, f] of Object.entries(fields)) {
      const inner = innerFields(collections, f);
      if (!visible(f, level)) delete out[key];
      else if (inner) out[key] = strip(collections, inner, out[key], level);
    }
    return out;
  });
}
