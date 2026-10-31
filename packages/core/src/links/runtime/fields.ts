// This file MUST import only browser-safe leaves. The admin bundles it.
import type { Block, Field, Fields, LinkField, RichtextField } from "../../schema/fields/index.ts";
import { unseenBlocks } from "../../schema/traversal/blocks-of.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";
import { isObject, matchCondition } from "../../schema/condition.ts";

/** A field that holds links: `richtext` or `link`. */
export type LinkingField = RichtextField | LinkField;

const isLinking = (field: Field): field is LinkingField =>
  field.type === "richtext" || field.type === "link";

/** One stored value of a linking field, with its positional path and whether its condition matches. */
export type LinkingValue = {
  path: string;
  field: LinkingField;
  parent: Record<string, any>;
  key: string;
  value: any;
  active: boolean;
};

/** Finds the values of linking fields inside groups, arrays and blocks. */
export function linkingValues(
  fields: Fields,
  data: Record<string, any>,
  prefix = "",
  root = data,
  active = true,
) {
  const found: LinkingValue[] = [];

  for (const [key, field] of Object.entries(fields)) {
    const value = data[key];
    const on = active && (!field.condition || matchCondition(field.condition, root, data));
    const path = `${prefix}${key}`;

    if (isLinking(field) && value)
      found.push({ path, field, parent: data, key, value, active: on });
    if (field.type === "group" && isObject(value))
      found.push(...linkingValues(field.fields, value, `${path}.`, root, on));
    if ((field.type === "array" || field.type === "blocks") && Array.isArray(value))
      for (const [i, item] of value.entries()) {
        const inner = itemFields(field, item);
        if (inner && isObject(item))
          found.push(...linkingValues(inner, item, `${path}.${i}.`, root, on));
      }
  }

  return found;
}

/** Whether an owner has any linking fields, including inside containers. */
export function hasLinkingFields(fields: Fields, seen = new Set<Block>()): boolean {
  return Object.values(fields).some(
    (f) =>
      isLinking(f) ||
      ((f.type === "group" || f.type === "array") && hasLinkingFields(f.fields, seen)) ||
      (f.type === "blocks" &&
        unseenBlocks(f, seen).some(([, b]) => hasLinkingFields(b.fields, seen))),
  );
}
