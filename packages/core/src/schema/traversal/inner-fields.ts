import { type Collection, type Field } from "../index.ts";

/**
 * Finds the fields a value continues with: a group's own, or the target collection's for a relation or join.
 * @returns `undefined` for leaves, `image` and `file` included.
 */
export function innerFields(collections: Record<string, Collection>, f: Field) {
  if (f.type === "group") return f.fields;
  if (f.type === "relation" || f.type === "join") return collections[f.collection].fields;
  return undefined;
}
