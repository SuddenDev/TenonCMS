import { type Fields, type FieldArgs } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";
import { matchCondition } from "../condition.ts";

/**
 * Runs the `validate` function of every field. Fields whose condition is false are skipped, with their children.
 * @returns The error messages by field path. Empty when every field passes.
 */
export async function validateFields(
  fields: Fields,
  data: Record<string, any>,
  args: Omit<FieldArgs, "siblingData" | "path">,
) {
  const errors: Record<string, string> = {};
  await eachField(fields, data, async (key, f, siblings, path) => {
    if (f.condition && !matchCondition(f.condition, args.data, siblings)) return false;
    const result = await f.validate?.(siblings[key], { ...args, siblingData: siblings, path });
    if (typeof result === "string") errors[path] = result;
  });
  return errors;
}
