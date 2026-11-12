import { type Field, type Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";

const ITEM_KEYS = ["id", "blockType"];

/**
 * Deletes the keys of `holder` that are neither a field nor in `keep`, in place, inside groups and items too. Stored
 * data keeps the values of removed or renamed fields until the next save. Values of other fields, relations included,
 * are not walked. An item of an unknown block stays as it is.
 */
export function dropUnknownKeys(
  fields: Fields,
  holder: Record<string, unknown>,
  keep: readonly string[] = [],
) {
  for (const key of Object.keys(holder)) {
    if (Object.hasOwn(fields, key)) dropInside(fields[key], holder[key]);
    else if (!keep.includes(key)) delete holder[key];
  }
}

function dropInside(f: Field, value: unknown) {
  if (f.type === "group" && isObject(value)) dropUnknownKeys(f.fields, value);
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const inner = itemFields(f, item);
    if (inner) dropUnknownKeys(inner, item, ITEM_KEYS);
  }
}
