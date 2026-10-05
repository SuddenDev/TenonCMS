import { type Fields, type HookArgs } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";

/**
 * Fills `undefined` fields with their `default`, in place. Children of a group get defaults only when the group is present.
 * @returns A promise that settles once every default is set.
 */
export function applyDefaults(fields: Fields, data: Record<string, unknown>, args: HookArgs) {
  return eachField(fields, data, async (key, f, siblings) => {
    if (siblings[key] !== undefined || f.default === undefined) return;
    siblings[key] =
      typeof f.default === "function" ? await f.default(args) : structuredClone(f.default);
  });
}
