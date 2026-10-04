import { type Fields, type HookArgs } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";

/** Fills `undefined` fields in place. Children of a group get defaults only when the group is present. */
export function applyDefaults(fields: Fields, data: Record<string, unknown>, args: HookArgs) {
  return eachField(fields, data, async (key, f, siblings) => {
    if (siblings[key] !== undefined || f.default === undefined) return;
    siblings[key] =
      typeof f.default === "function" ? await f.default(args) : structuredClone(f.default);
  });
}
