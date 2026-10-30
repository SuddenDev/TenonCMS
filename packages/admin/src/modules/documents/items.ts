import type { ArrayField, Block, BlocksField, Fields } from "../../../../core/src/schema";
import { blocksOf } from "../../../../core/src/schema/traversal/blocks-of";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";
import { normalize } from "./fields";

export type ListField = ArrayField | BlocksField;

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

/** The block of a block item. Undefined for an array item and for an unknown block. */
export function blockOf(field: ListField, item: Item): Block | undefined {
  if (field.type !== "blocks") return undefined;
  const blocks = blocksOf(field);
  return Object.hasOwn(blocks, item.blockType) ? blocks[item.blockType] : undefined;
}

/** Whether the list field `to` takes an item of the list field `from`: the same block under the same key, or the same array field. */
export function canHold(to: ListField, from: ListField, item: Item): boolean {
  if (from.type === "array") return to === from;
  const block = blockOf(to, item);
  return !!block && block === blockOf(from, item);
}

/** The lists inside an item, also inside its groups, in field order. Empty for an unknown block. */
export function nestedLists(field: ListField, item: Item, path: string) {
  const out: { key: string; field: ListField; items: Item[]; path: string }[] = [];
  const walk = (fields: Fields, value: Record<string, any>, at: string) => {
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === "group" && value[key]) walk(f.fields, value[key], `${at}.${key}`);
      else if ((f.type === "array" || f.type === "blocks") && Array.isArray(value[key]))
        out.push({ key, field: f, items: value[key], path: `${at}.${key}` });
    }
  };
  walk(itemFields(field, item) ?? {}, item, path);
  return out;
}

const valueAt = (list: Item[], path: string): any =>
  path ? path.split(".").reduce<any>((v, k) => v?.[k], list) : list;

/**
 * Moves the item at the path `from` into the list at the path `to`, before its position `index`. Both paths are
 * relative to `list`; `""` is `list` itself. Changes the lists in place.
 */
export function moveItemTo(list: Item[], from: string, to: string, index: number) {
  const cut = from.lastIndexOf(".");
  const source: Item[] = valueAt(list, from.slice(0, Math.max(cut, 0)));
  const target: Item[] = valueAt(list, to);
  const i = Number(from.slice(cut + 1));
  const [item] = source.splice(i, 1);
  target.splice(source === target && i < index ? index - 1 : index, 0, item);
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
