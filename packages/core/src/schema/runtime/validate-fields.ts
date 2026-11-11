import { type Fields, type FieldArgs, type StandardSchema } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";
import { matchCondition } from "../condition.ts";

/**
 * Runs the `validate` function or Standard Schema of every field. Fields whose condition is false are skipped, with their children.
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
    if (!f.validate) return;
    const value = siblings[key];
    const result =
      "~standard" in f.validate
        ? await checkStandardSchema(f.validate, value)
        : await f.validate(value, { ...args, siblingData: siblings, path });
    if (typeof result === "string") errors[path] = result;
  });
  return errors;
}

/** @returns `true`, or the message of the first issue. Empty values pass, like the built-in checks. */
async function checkStandardSchema(schema: StandardSchema, value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  const { issues } = await schema["~standard"].validate(value);
  return issues?.length ? issues[0].message : true;
}
