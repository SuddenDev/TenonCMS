import { z } from "zod";
import { isObject, matchCondition } from "../condition.ts";
import { fieldSchema } from "../fields/field-schema.ts";
import { type Fields, type StoredField } from "../index.ts";

/**
 * Builds the validator for `data`. Unknown keys are stripped. Joins are skipped.
 * A field whose `condition` is false keeps its type check, but `required` and the built-in checks are skipped.
 * @param root The whole document, for `/` paths in conditions.
 * @param active Whether the enclosing group applies. `false` checks types only.
 * @returns A zod object for one level of fields.
 */
export function dataSchema(
  fields: Fields,
  data: unknown = {},
  root = data,
  active = true,
): z.ZodObject {
  const siblings = isObject(data) ? data : {};
  const entries = Object.entries(fields).flatMap(([name, field]) =>
    field.type === "join"
      ? []
      : [[name, fieldEntry(field, siblings[name], siblings, root, active)]],
  );
  return z.object(Object.fromEntries(entries));
}

// A group recurses into its own value. A field that is not required or not active MAY be missing or `null`.
function fieldEntry(
  field: StoredField,
  value: unknown,
  siblings: Record<string, unknown>,
  root: unknown,
  active: boolean,
) {
  const on = active && (!field.condition || matchCondition(field.condition, root, siblings));
  const schema =
    field.type === "group" ? dataSchema(field.fields, value, root, on) : fieldSchema(field, on);
  return on && field.required ? schema : schema.optional().nullable();
}
