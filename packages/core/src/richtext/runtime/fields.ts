import type { Block, Fields, RichtextField } from "../../schema/fields/index.ts";
import { unseenBlocks } from "../../schema/traversal/blocks-of.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";
import { isObject, matchCondition } from "../../schema/condition.ts";
import type { RichtextDocument } from "../config/types.ts";

/** Finds rich text values inside groups, arrays and blocks. */
export function richtextFields(
  fields: Fields,
  data: Record<string, any>,
  prefix = "",
  root = data,
  active = true,
) {
  const found: {
    path: string;
    field: RichtextField;
    parent: Record<string, any>;
    key: string;
    value: RichtextDocument;
    active: boolean;
  }[] = [];

  for (const [key, field] of Object.entries(fields)) {
    const value = data[key];
    const on = active && (!field.condition || matchCondition(field.condition, root, data));
    const path = `${prefix}${key}`;

    if (field.type === "richtext" && value)
      found.push({ path, field, parent: data, key, value, active: on });
    if (field.type === "group" && isObject(value))
      found.push(...richtextFields(field.fields, value, `${path}.`, root, on));
    if ((field.type === "array" || field.type === "blocks") && Array.isArray(value))
      for (const [i, item] of value.entries()) {
        const inner = itemFields(field, item);
        if (inner && isObject(item))
          found.push(...richtextFields(inner, item, `${path}.${i}.`, root, on));
      }
  }

  return found;
}

/** Whether an owner has any rich text fields, including inside containers. */
export function hasRichtext(fields: Fields, seen = new Set<Block>()): boolean {
  return Object.values(fields).some(
    (f) =>
      f.type === "richtext" ||
      ((f.type === "group" || f.type === "array") && hasRichtext(f.fields, seen)) ||
      (f.type === "blocks" && unseenBlocks(f, seen).some(([, b]) => hasRichtext(b.fields, seen))),
  );
}
