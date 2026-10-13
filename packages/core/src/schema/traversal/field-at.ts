import { type Fields, type Field } from "../index.ts";
import { isObject } from "../condition.ts";
import { itemFields } from "./item-fields.ts";

/**
 * Finds the field at a dot path, through groups, array items and block items. After an array or blocks field, the
 * next segment MUST be an index: `links.2.label`. A block item's fields depend on its `blockType`, so they are found
 * only with `data`.
 * @param data The value that holds `fields`, walked along the path.
 * @returns The field, or `undefined` when no field is at the path.
 */
export function fieldAt(fields: Fields, path: string, data?: unknown): Field | undefined {
  const [key, ...rest] = path.split(".");
  const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (!f || !rest.length) return f;
  const value = isObject(data) ? data[key] : undefined;
  if (f.type === "group") return fieldAt(f.fields, rest.join("."), value);
  if ((f.type === "array" || f.type === "blocks") && rest.length > 1 && /^\d+$/.test(rest[0]!)) {
    const item = Array.isArray(value) ? value[Number(rest[0])] : undefined;
    const inner = f.type === "array" ? f.fields : itemFields(f, item);
    return inner && fieldAt(inner, rest.slice(1).join("."), item);
  }
  return undefined;
}
