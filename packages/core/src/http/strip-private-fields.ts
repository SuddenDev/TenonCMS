import { innerFields } from "../schema/traversal/inner-fields.ts";
import { itemFields } from "../schema/traversal/item-fields.ts";
import { mapValue } from "../schema/traversal/map-value.ts";
import type { Collection, Fields } from "../schema/index.ts";
import { visible, type Visibility } from "./visibility.ts";

/**
 * Removes the fields the caller cannot see from a document or a list of documents. It recurses into groups, array
 * and block items, populated relations and joins. A public reader gets only `id` and `blockType` of an item of an
 * unknown block. Read responses MUST go through it after selection.
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
      if (!visible(f, visibility)) delete out[key];
      else if (f.type === "blocks")
        out[key] = mapValue(out[key], (item) => {
          const inner = itemFields(f, item);
          if (inner) return stripPrivateFields(collections, inner, item, visibility);
          // The fields of an unknown block are unknown, so a public reader MUST NOT see any of them.
          return visibility === "admin" ? item : { id: item.id, blockType: item.blockType };
        });
      else {
        const inner = innerFields(collections, f);
        if (inner) out[key] = stripPrivateFields(collections, inner, out[key], visibility);
      }
    }
    return out;
  });
}
