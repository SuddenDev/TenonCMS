import { type Fields, type StoredField } from "../index.ts";
import { isObject } from "../condition.ts";
import { itemFields } from "./item-fields.ts";

type Visit = (
  key: string,
  field: StoredField,
  siblings: Record<string, any>,
  path: string,
) => unknown;

/**
 * Visits every stored field of `fields` in order, with the object that holds its value. After the visit, a group whose
 * value is an object is walked too, and so is each object item of an array, with the item as `siblings` and the prefix
 * `<path>.<index>.`. A visit that returns `false` skips both. Joins are skipped.
 * @returns A promise that settles once every field is visited.
 */
export async function eachField(
  fields: Fields,
  siblings: Record<string, any>,
  visit: Visit,
  prefix = "",
) {
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === "join") continue;
    const path = prefix + key;
    if ((await visit(key, field, siblings, path)) === false) continue;
    const value = siblings[key];
    if (field.type === "group" && isObject(value))
      await eachField(field.fields, value, visit, `${path}.`);
    else if (Array.isArray(value))
      for (const [i, item] of value.entries()) {
        const inner = itemFields(field, item);
        if (inner) await eachField(inner, item, visit, `${path}.${i}.`);
      }
  }
}
