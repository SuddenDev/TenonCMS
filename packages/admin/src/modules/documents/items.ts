import type { ArrayField, Block, BlocksField, Fields } from "../../../../core/src/schema";
import { blocksOf } from "../../../../core/src/schema/traversal/blocks-of";
import { itemFields } from "../../../../core/src/schema/traversal/item-fields";
import type { LinkResolution } from "../../../../core/src/links/config/types";
import { normalize } from "./fields";
import { linkHost } from "./links";

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

/**
 * Inserts `item` into the list at the path `to`, relative to `list`, at `index` or at the end. Changes it in place.
 * @returns The item's position.
 */
export function insertItemAt(list: Item[], to: string, item: Item, index?: number) {
  const target: Item[] = valueAt(list, to);
  const at = index ?? target.length;
  target.splice(at, 0, item);
  return at;
}

/**
 * Removes the item at the path `at`, relative to `list`, in place.
 * @returns The removed item.
 */
export function removeItemAt(list: Item[], at: string): Item {
  const cut = at.lastIndexOf(".");
  const source: Item[] = valueAt(list, at.slice(0, Math.max(cut, 0)));
  return source.splice(Number(at.slice(cut + 1)), 1)[0];
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

/**
 * The row title of an item: the `itemLabels.title` template filled with its values, else its first non-empty text
 * value. Empty when it has neither or the block is unknown.
 */
export function itemTitle(item: Item, field: ArrayField | BlocksField): string {
  const template = field.itemLabels?.title;
  if (template) {
    const title = template
      .replace(/\{(\w+)\}/g, (_, key) => {
        const v = item[key];
        return typeof v === "string" || typeof v === "number" ? String(v) : "";
      })
      .trim();
    if (title.replace(/[^\p{L}\p{N}]/gu, "")) return title;
  }

  for (const [k, f] of Object.entries(itemFields(field, item) ?? {})) {
    const v = item[k];
    if (TEXT.includes(f.type) && typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** Looks up the resolution of a link reference, see `useLinks()`. */
export type ResolveLink = (reference: {
  collection: string;
  id: string;
}) => LinkResolution | undefined;

/**
 * What a tree row shows. `title`: the first text value, else the title of the first `link` field (`fromLink`), else
 * empty. `line`: the link's path, or the host of an external link, with the `collection` of a reference. Without a
 * link, there is no `line`.
 */
export function treeRow(
  item: Item,
  field: ListField,
  resolve: ResolveLink,
): { title: string; fromLink: boolean; line?: string; collection?: string } {
  const fields = itemFields(field, item) ?? {};
  const key = Object.keys(fields).find((k) => fields[k].type === "link" && item[k]);
  const link = key ? item[key] : undefined;
  const resolved = link?.reference ? resolve(link.reference) : undefined;
  const title = itemTitle(item, field);
  const linkTitle = resolved?.title ?? "";
  const row = { title: title || linkTitle, fromLink: !title && !!linkTitle };

  if (link?.reference)
    return resolved?.href
      ? { ...row, line: resolved.href, collection: link.reference.collection }
      : { ...row, collection: link.reference.collection };
  if (typeof link?.href === "string") return { ...row, line: linkHost(link.href) };
  return row;
}

/** Whether `errors` holds a message at `path` or below it. A row uses it for itself and its descendants. */
export function hasErrorsAt(errors: Record<string, string> | undefined, path: string) {
  return Object.keys(errors ?? {}).some((key) => key === path || key.startsWith(`${path}.`));
}

/**
 * The items from the top list down to the deepest one whose path is `target` or holds it. Only lists that
 * `nestedLists()` finds are followed.
 * @returns An empty list when `target` is outside the list at `path`.
 */
export function itemChain(field: ListField, items: Item[], path: string, target: string) {
  const chain: { path: string; item: Item; field: ListField }[] = [];
  let list = { field, items, path };

  while (target.startsWith(`${list.path}.`)) {
    const index = Number(target.slice(list.path.length + 1).split(".")[0]);
    const item = list.items[index];
    if (!item) break;

    const at = `${list.path}.${index}`;
    chain.push({ path: at, item, field: list.field });
    const next = nestedLists(list.field, item, at).find(
      (l) => target === l.path || target.startsWith(`${l.path}.`),
    );
    if (!next) break;
    list = next;
  }

  return chain;
}
