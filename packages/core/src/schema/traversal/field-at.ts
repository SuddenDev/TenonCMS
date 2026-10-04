import { type Fields, type Field } from "../index.ts";

/** The field at a dot path, through groups. */
export function fieldAt(fields: Fields, path: string): Field | undefined {
  const [key, ...rest] = path.split(".");
  const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (!f || !rest.length) return f;
  return f.type === "group" ? fieldAt(f.fields, rest.join(".")) : undefined;
}
