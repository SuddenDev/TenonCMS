import { z } from "zod";
import { isObject, matchCondition } from "../condition.ts";
import { fieldSchema } from "../fields/field-schema.ts";
import { type Fields } from "../index.ts";

/**
 * Builds the validator for `data`. Unknown keys are stripped.
 * A field whose `condition` is false keeps its type check, but `required` and the built-in checks are skipped.
 */
export function dataSchema(
  fields: Fields,
  data: unknown = {},
  root = data,
  active = true,
): z.ZodObject {
  const siblings = isObject(data) ? data : {};
  return z.object(
    Object.fromEntries(
      Object.entries(fields).flatMap(([name, field]) => {
        if (field.type === "join") return [];
        const on = active && (!field.condition || matchCondition(field.condition, root, siblings));
        const s =
          field.type === "group"
            ? dataSchema(field.fields, siblings[name], root, on)
            : fieldSchema(field, on);
        return [[name, on && field.required ? s : s.optional().nullable()]];
      }),
    ),
  );
}
