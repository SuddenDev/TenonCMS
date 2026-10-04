import { type Fields, type StoredField } from "../index.ts";
import { isObject } from "../condition.ts";

type Visit = (
  key: string,
  field: StoredField,
  siblings: Record<string, any>,
  path: string,
) => unknown;
/**
 * Visits every stored field of `fields` in order, with the object that holds its value. After the visit, a group whose
 * value is an object is walked too, unless `visit` returned `false`. Joins are skipped.
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
    if (field.type === "group" && isObject(siblings[key]))
      await eachField(field.fields, siblings[key], visit, `${path}.`);
  }
}
