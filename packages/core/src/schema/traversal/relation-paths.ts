import { type Fields, type RefField } from "../index.ts";
import { isRef } from "./reference-fields.ts";

/** Every `relation`, `image` and `file` at the top level and inside groups, with its key path. */
export function relationPaths(
  fields: Fields,
  prefix: string[] = [],
): { path: string[]; field: RefField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    isRef(f)
      ? [{ path: [...prefix, key], field: f }]
      : f.type === "group"
        ? relationPaths(f.fields, [...prefix, key])
        : [],
  );
}
