import { z } from "zod";
import { isObject, matchCondition } from "../condition.ts";
import { fieldSchema } from "../fields/field-schema.ts";
import { type ArrayField, type BlocksField, type Fields, type StoredField } from "../index.ts";
import { itemFields } from "../traversal/item-fields.ts";

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

// A group, an array or a blocks field recurses into its own value.
// A field that is not required or not active MAY be missing or `null`.
function fieldEntry(
  field: StoredField,
  value: unknown,
  siblings: Record<string, unknown>,
  root: unknown,
  active: boolean,
) {
  const on = active && (!field.condition || matchCondition(field.condition, root, siblings));
  const schema =
    field.type === "group"
      ? dataSchema(field.fields, value, root, on)
      : field.type === "array" || field.type === "blocks"
        ? itemsSchema(field, value, root, on)
        : fieldSchema(field, on);
  return on && field.required ? schema : schema.optional().nullable();
}

/**
 * Builds the validator of an `array` or `blocks` field from its current value. A tuple with one schema per item keeps
 * issue paths positional (`links.2.label`), and each item's conditions read that item. A block item also has a
 * `blockType`, which MUST name one of the field's blocks.
 * @param on Whether the field applies. `false` skips `required`, `minRows` and `maxRows`.
 */
function itemsSchema(field: ArrayField | BlocksField, value: unknown, root: unknown, on: boolean) {
  if (!Array.isArray(value)) return z.array(z.unknown());
  const blockType =
    field.type === "blocks"
      ? {
          blockType: z.custom<string>(
            (t) => typeof t === "string" && Object.hasOwn(field.blocks, t),
            "Unknown block",
          ),
        }
      : {};
  const items = value.map((item) =>
    z
      .object({
        id: z
          .string()
          .min(1)
          .default(() => crypto.randomUUID()),
        ...blockType,
      })
      .extend(dataSchema(itemFields(field, item) ?? {}, item, root, on).shape),
  );
  const min = on ? Math.max(field.minRows ?? 0, field.required ? 1 : 0) : 0;
  const max = on ? (field.maxRows ?? Infinity) : Infinity;
  return z.tuple(items as [z.ZodObject, ...z.ZodObject[]]).superRefine((list, ctx) => {
    if (list.length < min) ctx.addIssue({ code: "custom", message: `At least ${count(min)}` });
    if (list.length > max) ctx.addIssue({ code: "custom", message: `At most ${count(max)}` });
    const ids = list.map((item) => (item as { id: string }).id);
    if (new Set(ids).size < ids.length) ctx.addIssue({ code: "custom", message: "Duplicate id" });
  });
}

const count = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
