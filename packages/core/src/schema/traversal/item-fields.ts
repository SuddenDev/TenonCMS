// This file MUST have type imports only. The admin bundles it.
import type { Field, Fields } from "../fields/index.ts";

/**
 * Finds the fields of one item of an `array` or `blocks` field. A block item's fields are those of its `blockType`.
 * @returns The item's fields, or `undefined` for another field type, an item that is not an object or an unknown block.
 */
export function itemFields(field: Field, item: unknown): Fields | undefined {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
  if (field.type === "array") return field.fields;
  if (field.type !== "blocks") return undefined;
  const type = (item as { blockType?: unknown }).blockType;
  return typeof type === "string" && Object.hasOwn(field.blocks, type)
    ? field.blocks[type].fields
    : undefined;
}
