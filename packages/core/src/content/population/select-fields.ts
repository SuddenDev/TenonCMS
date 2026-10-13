import { type Collection, type Fields } from "../../schema/index.ts";
import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";
import { mapValue } from "../../schema/traversal/map-value.ts";

type Collections = Record<string, Collection>;

/** Keys a read returns. `true` keeps the value; an object lists keys inside a group or a resolved relation or join. */
export type SelectSpec = { [key: string]: true | SelectSpec };

/**
 * Keeps `id` at every document level and in every array item (`meta`), and `blockType` in every block item. A block
 * item takes the spec of its block name: `true` keeps it whole, an object picks its fields, none leaves
 * `{ id, blockType }`. Values that are not objects stay as they are.
 * @returns A copy of `doc` with only the keys in `select`.
 */
export function pick(
  collections: Collections,
  fields: Fields,
  doc: Record<string, any>,
  select: SelectSpec,
  meta = true,
): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [key, s] of Object.entries(meta ? { id: true as const, ...select } : select)) {
    if (!Object.hasOwn(doc, key)) continue;

    const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (f?.type === "blocks" && s !== true) {
      out[key] = mapValue(doc[key], (item) => {
        const spec = Object.hasOwn(s, item.blockType) ? s[item.blockType] : undefined;
        if (spec === true) return item;
        const inner = itemFields(f, item);
        const meta = { id: item.id, blockType: item.blockType };
        return spec && inner ? { ...meta, ...pick(collections, inner, item, spec, false) } : meta;
      });
      continue;
    }
    const inner = f && s !== true && innerFields(collections, f);
    out[key] = inner
      ? mapValue(doc[key], (d) => pick(collections, inner, d, s as SelectSpec, f.type !== "group"))
      : doc[key];
  }

  return out;
}
