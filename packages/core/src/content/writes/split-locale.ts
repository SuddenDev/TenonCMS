import type { Field, Fields } from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";
import { holdsList } from "../../schema/traversal/localized-fields.ts";

type Data = Record<string, unknown>;

/**
 * Splits written data by storage. `keys` are the top-level keys that live in locale rows.
 * Only keys present in `data` are copied, so a partial write stays partial.
 * With a synced `structure`, each of its fields stores the structure in the shared data and the values by item id in the
 * locale data. Values of items outside the structure are dropped.
 */
export function splitLocale(
  keys: readonly string[],
  data: Data,
  structure?: { fields: Record<string, Field>; synced: boolean },
): { shared: Data; localized: Data } {
  const shared: Data = { ...data };
  const localized: Data = {};
  for (const key of keys) {
    if (!(key in data)) continue;
    localized[key] = data[key];
    delete shared[key];
  }
  if (!structure?.synced) return { shared, localized };

  for (const [key, field] of Object.entries(structure.fields)) {
    if (!(key in data)) continue;
    shared[key] = structureOf(field, data[key]);
    localized[key] = valuesOf(field, data[key]);
  }
  return { shared, localized };
}

/** The structure of a list or group value: items with only `id`, `blockType` and nested lists. */
export function structureOf(field: Field, value: unknown): unknown {
  if (field.type === "group") return isObject(value) ? structureIn(field.fields, value) : null;
  if (!Array.isArray(value)) return null;
  return value.filter(isObject).map((item) => ({
    id: item.id,
    ...(field.type === "blocks" && { blockType: item.blockType }),
    ...structureIn(itemFields(field, item) ?? {}, item),
  }));
}

function structureIn(fields: Fields, value: Data) {
  const out: Data = {};
  for (const [key, f] of Object.entries(fields))
    if (holdsList(f)) out[key] = structureOf(f, value[key]);
  return out;
}

// The values of a list or group value, lists as maps by item id.
function valuesOf(field: Field, value: unknown): unknown {
  if (field.type === "group")
    return isObject(value) ? valuesIn(field.fields, value) : (value ?? null);
  if (field.type !== "array" && field.type !== "blocks") return value;
  if (!Array.isArray(value)) return value ?? null;
  return Object.fromEntries(
    value.filter(isObject).map((item) => [item.id, valuesIn(itemFields(field, item) ?? {}, item)]),
  );
}

function valuesIn(fields: Fields, value: Data) {
  const out: Data = {};
  for (const [key, f] of Object.entries(fields))
    if (f.type !== "join" && key in value) out[key] = valuesOf(f, value[key]);
  return out;
}
