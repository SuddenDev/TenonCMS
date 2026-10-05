import { innerFields } from "../schema/traversal/inner-fields.ts";
import { mapValue } from "../schema/traversal/map-value.ts";
import type { Collection, Fields } from "../schema/index.ts";
import { visible, type Visibility } from "./visibility.ts";

/**
 * Removes the fields the caller cannot see from a document or a list of documents. It recurses into groups,
 * populated relations and joins. Read responses MUST go through it after selection.
 * @returns A copy of `doc` without the hidden fields.
 */
export function stripPrivateFields(
  collections: Record<string, Collection>,
  fields: Fields,
  doc: unknown,
  visibility: Visibility,
): unknown {
  return mapValue(doc, (d) => {
    const out = { ...d };
    for (const [key, f] of Object.entries(fields)) {
      const inner = innerFields(collections, f);
      if (!visible(f, visibility)) delete out[key];
      else if (inner) out[key] = stripPrivateFields(collections, inner, out[key], visibility);
    }
    return out;
  });
}
