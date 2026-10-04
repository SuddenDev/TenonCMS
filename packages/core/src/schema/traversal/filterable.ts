import { type Fields } from "../index.ts";
import { isRef } from "./reference-fields.ts";

/** Whether `where` accepts `key`. Groups, joins and `many` relations, images and files are not filterable. */
export function filterable(fields: Fields, key: string) {
  if (!Object.hasOwn(fields, key)) return false;
  const field = fields[key];
  return field.type !== "group" && field.type !== "join" && !(isRef(field) && field.many);
}
