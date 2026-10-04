import { type Field, type RefField } from "../index.ts";

/** Whether a field stores ids: `relation`, `image` or `file`. */
export const isRef = (f: Field): f is RefField =>
  f.type === "relation" || f.type === "image" || f.type === "file";

/** The collection a field's ids point to. `image` and `file` point to `media`. */
export const targetOf = (f: RefField) => (f.type === "relation" ? f.collection : "media");
