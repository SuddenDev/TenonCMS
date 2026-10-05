import { type Fields, type FieldHooks } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";
import { runHooks } from "./run-hooks.ts";

/**
 * Runs one stage of field hooks in place, depth-first. A group's own hooks run before its fields'.
 * @returns A promise that settles once every hook ran.
 */
export function runFieldHooks(
  stage: keyof FieldHooks<unknown>,
  fields: Fields,
  data: Record<string, any>,
  args: object,
) {
  return eachField(fields, data, async (key, f, siblings, path) => {
    if (!f.hooks?.[stage]) return;
    const value = await runHooks(f.hooks[stage], "value", siblings[key], {
      ...args,
      siblingData: siblings,
      path,
    });
    if (value !== undefined) siblings[key] = value;
  });
}
