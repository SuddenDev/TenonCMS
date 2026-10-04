import { type Collection, type Field } from "../index.ts";

/** The fields a value continues with: a group's own, or the target collection's for a relation or join. `image` and `file` are leaves. */
export function innerFields(collections: Record<string, Collection>, f: Field) {
  if (f.type === "group") return f.fields;
  if (f.type === "relation" || f.type === "join") return collections[f.collection].fields;
  return undefined;
}
