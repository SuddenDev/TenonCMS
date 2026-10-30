import type { ArrayField, BlocksField, Fields } from "../../../../core/src/schema";
import { blocksOf } from "../../../../core/src/schema/traversal/blocks-of";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";
import { normalize } from "./fields";

/** One item of an `array` or `blocks` field: its stable `id`, its `blockType` (blocks only) and the item fields. */
export type Item = { id: string; [key: string]: any };

/**
 * A new item with an `id` and the plain defaults of its fields, like a new document gets them.
 * A block item also has its `blockType`.
 */
export function newItem(field: ArrayField | BlocksField, blockType?: string): Item {
  const fields = field.type === "blocks" ? blocksOf(field)[blockType!].fields : field.fields;
  return {
    id: crypto.randomUUID(),
    ...(field.type === "blocks" && { blockType }),
    ...normalize(fields, {}, false, true),
  };
}

/** Returns a copy of `list` with the item at `from` moved to `to`. Positions outside the list change nothing. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  if (from === to || !(from in out) || to < 0 || to >= out.length) return out;
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

function renew(value: Record<string, any>, fields: Fields) {
  for (const [k, f] of Object.entries(fields)) {
    const v = value[k];
    if (!v || typeof v !== "object") continue;
    if (f.type === "group") renew(v, f.fields);
    else if (f.type === "array" || f.type === "blocks")
      for (const item of v) {
        item.id = crypto.randomUUID();
        const inner = itemFields(f, item);
        if (inner) renew(item, inner);
      }
  }
}

/** Copies an item with new ids at every depth. The copy shares nothing with the original. */
export function duplicateItem(item: Item, field: ArrayField | BlocksField): Item {
  const copy: Item = JSON.parse(JSON.stringify(item));
  copy.id = crypto.randomUUID();
  const fields = itemFields(field, copy);
  if (fields) renew(copy, fields);
  return copy;
}

const TEXT = ["text", "textarea", "slug"];

/** The first non-empty text value of an item, for its row header. Empty when it has none or the block is unknown. */
export function itemTitle(item: Item, field: ArrayField | BlocksField): string {
  for (const [k, f] of Object.entries(itemFields(field, item) ?? {})) {
    const v = item[k];
    if (TEXT.includes(f.type) && typeof v === "string" && v.trim()) return v;
  }
  return "";
}
