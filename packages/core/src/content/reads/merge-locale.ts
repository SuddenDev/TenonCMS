import type { Field, Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";

type Data = Record<string, unknown>;

/** How a merge treats the items of the fields whose structure MAY be shared. */
export type StructureOptions = {
  /** The localized top-level fields that hold lists, by key. */
  fields: Record<string, Field>;
  /** Whether a document without its own `syncStructure` uses one structure. */
  syncDefault: boolean;
  /** The default locale's row. It gives the structure of a synced document that has none stored yet. */
  base: Data | null | undefined;
};

/**
 * Builds the document of one locale. `keys` are the top-level keys that live in locale rows.
 * Shared keys come from `shared`. Each localized key takes `localized[key]`, then `fallback?.[key]`, then `null`.
 * A stored `null` falls back too. Stale values for other keys in locale rows are ignored.
 *
 * With `structure`, each list field takes its items from the shared structure when the document is synced, else from the
 * locale row's own list. Values fill by item id, field by field, with the same fallback. The result gets `syncStructure`
 * and `syncStructureDefault`.
 */
export function mergeLocale(
  keys: readonly string[],
  shared: Data,
  localized: Data | null | undefined,
  fallback: Data | null | undefined,
  structure?: StructureOptions,
): Data {
  const out: Data = { ...shared };
  for (const key of keys) out[key] = localized?.[key] ?? fallback?.[key] ?? null;
  if (!structure || !Object.keys(structure.fields).length) return out;

  const own = typeof shared.syncStructure === "boolean" ? shared.syncStructure : undefined;
  const synced = own ?? structure.syncDefault;
  for (const [key, field] of Object.entries(structure.fields)) {
    const mine = localized?.[key];
    // A separate row that still holds values by id shows the default locale's values where it has none.
    const fb = !synced && needsStructure(field, mine) ? structure.base?.[key] : fallback?.[key];
    out[key] = mergeValue(
      field,
      { structure: shared[key], own: mine, fb, base: structure.base?.[key] },
      synced,
    );
  }
  out.syncStructure = synced;
  out.syncStructureDefault = own === undefined;
  return out;
}

/** Whether a stored locale value holds items by id, so it needs the shared structure. */
export function needsStructure(field: Field, value: unknown): boolean {
  if (field.type === "array" || field.type === "blocks") return isObject(value);
  if (field.type !== "group" || !isObject(value)) return false;
  return Object.entries(field.fields).some(([k, f]) => needsStructure(f, value[k]));
}

/** The same position in the shared structure, the locale row, the fallback row and the default locale's row. */
type Node = { structure: unknown; own: unknown; fb: unknown; base: unknown };

const at = (value: unknown, key: string) => (isObject(value) ? value[key] : undefined);

const byId = (list: unknown, id: unknown): unknown =>
  Array.isArray(list)
    ? list.find((item) => isObject(item) && item.id === id)
    : typeof id === "string"
      ? at(list, id)
      : undefined;

/**
 * Builds one value of a structure field: lists from the structure of the document's state, groups field by field, other
 * values from the row, then the fallback, then `null`.
 */
export function mergeValue(field: Field, n: Node, synced: boolean): unknown {
  if (field.type === "group") {
    const present = [n.own, n.fb, ...(synced ? [n.structure, n.base] : [])].some(isObject);
    return present ? mergeFields(field.fields, n, synced) : (n.own ?? n.fb ?? null);
  }
  if (field.type !== "array" && field.type !== "blocks") return n.own ?? n.fb ?? null;

  const items = itemsOf(n, synced);
  if (!items) return null;
  return items.flatMap((item) => {
    const fields = itemFields(field, item);
    if (!fields || !isObject(item)) return [];
    const node = {
      structure: item,
      own: byId(n.own, item.id),
      fb: byId(n.fb, item.id),
      base: byId(n.base, item.id),
    };
    const head =
      field.type === "blocks" ? { id: item.id, blockType: item.blockType } : { id: item.id };
    return [{ ...head, ...mergeFields(fields, node, synced) }];
  });
}

// A synced list takes the shared structure, else the default locale's list. A separate list takes the row's own list,
// else the shared structure for a row that holds values by id, else the fallback's.
function itemsOf(n: Node, synced: boolean): unknown[] | null {
  if (synced) return ([n.structure, n.base, n.own].find(Array.isArray) as unknown[]) ?? null;
  const list = n.own ?? n.fb;
  if (list == null) return null;
  if (Array.isArray(list)) return list;
  return Array.isArray(n.structure) ? n.structure : null;
}

function mergeFields(fields: Fields, n: Node, synced: boolean) {
  const out: Data = {};
  for (const [key, f] of Object.entries(fields)) {
    if (f.type === "join") continue;
    const child = {
      structure: at(n.structure, key),
      own: at(n.own, key),
      fb: at(n.fb, key),
      base: at(n.base, key),
    };
    out[key] = mergeValue(f, child, synced);
  }
  return out;
}

/**
 * A locale row with full lists: each structure field that holds values by id gets the items of `shared`'s structure with
 * the row's values, without fallback. Other keys stay as they are.
 */
export function withLists(fields: Record<string, Field>, shared: Data, row: Data): Data {
  const out = { ...row };
  for (const [key, field] of Object.entries(fields))
    if (needsStructure(field, row[key]))
      out[key] = mergeValue(
        field,
        { structure: shared[key], own: row[key], fb: null, base: null },
        true,
      );
  return out;
}
