import { type Collection, type Field, type Fields, type Schema } from "../../schema/index.ts";
import { innerFields } from "../../schema/traversal/inner-fields.ts";
import { itemFields } from "../../schema/traversal/item-fields.ts";
import { mapValue } from "../../schema/traversal/map-value.ts";
import { relationPaths } from "../../schema/traversal/relation-paths.ts";
import { type SelectSpec, pick } from "./select-fields.ts";

type Collections = Record<string, Collection>;

const cache = new WeakMap<Schema, boolean>();

/** Whether a relation anywhere in the schema has a `select`. Reads without one skip the walk. */
export function hasRelationSelects(schema: Schema) {
  let has = cache.get(schema);
  if (has === undefined) {
    const owners = [
      ...Object.values(schema.collections ?? {}),
      ...Object.values(schema.globals ?? {}),
    ];
    has = owners.some(({ fields }) =>
      relationPaths(fields).some(({ field }) => field.type === "relation" && field.select),
    );
    cache.set(schema, has);
  }
  return has;
}

/**
 * Trims every populated relation with a `select` to it, unless the read's `select` lists that relation with an
 * object. Runs before the read's own `select`, which then trims what is left.
 * @param select The read's `select`, or `true` without one.
 * @returns A copy of `doc`. Ids and unselected keys pass through unchanged.
 */
export function applyRelationSelects(
  collections: Collections,
  fields: Fields,
  doc: Record<string, any>,
  select: SelectSpec | true,
): Record<string, any> {
  const out = { ...doc };
  for (const key of Object.keys(doc)) {
    const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
    const s = specAt(select, key);
    if (f && s) out[key] = applyToValue(collections, f, doc[key], s);
  }
  return out;
}

// `true` passes down. A key the spec does not list is left out by the read's own `select`.
const specAt = (select: SelectSpec | true, key: string) =>
  select === true ? true : Object.hasOwn(select, key) ? select[key] : undefined;

function applyToValue(collections: Collections, f: Field, value: unknown, s: SelectSpec | true) {
  if (f.type === "relation" && f.select && s === true) {
    const { fields } = collections[f.collection];
    const own = f.select;
    return mapValue(value, (d) =>
      pick(collections, fields, applyRelationSelects(collections, fields, d, own), own),
    );
  }
  if (f.type === "blocks")
    return mapValue(value, (item) => {
      const spec = specAt(s, item.blockType);
      const inner = itemFields(f, item);
      return spec && inner ? applyRelationSelects(collections, inner, item, spec) : item;
    });
  const inner = innerFields(collections, f);
  return inner ? mapValue(value, (d) => applyRelationSelects(collections, inner, d, s)) : value;
}
