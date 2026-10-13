import { type BlocksField, type Collection, type Field, type GroupField } from "../index.ts";

/**
 * Finds the fields a value continues with: a group's or an array item's own, the target collection's for a relation
 * or join, or for blocks one group per block (see {@link blockGroups}).
 * @returns `undefined` for leaves, `image` and `file` included.
 */
export function innerFields(collections: Record<string, Collection>, f: Field) {
  if (f.type === "group" || f.type === "array") return f.fields;
  if (f.type === "blocks") return blockGroups(f);
  if (f.type === "relation" || f.type === "join") return collections[f.collection].fields;
  return undefined;
}

/**
 * The blocks of a `blocks` field as groups keyed by block name, so `populate` and `select` specs name a block like a
 * group.
 * @returns A record of block name to `{ type: "group", fields }`.
 */
export const blockGroups = (f: BlocksField): Record<string, GroupField> =>
  Object.fromEntries(
    Object.entries(f.blocks).map(([name, b]) => [name, { type: "group", fields: b.fields }]),
  );
