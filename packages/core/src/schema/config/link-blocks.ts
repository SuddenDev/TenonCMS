// This file MUST have type imports only. The admin bundles it.
import type { Block, Field, Fields, Schema } from "../index.ts";

/**
 * Replaces each block name in a `blocks` field with the shared block of that name. A list of names becomes a record
 * with the names as keys. A shared block that contains
 * itself, directly or through others, becomes a cycle of objects. Groups, items and blocks are copies, so `schema` is
 * not changed; other fields stay the same objects.
 * @returns The linked copy. Its `blocks` holds the shared blocks that the fields point to.
 * @throws {Error} For a name that `schema.blocks` does not hold.
 */
export function linkBlocks<S extends Schema>(schema: S): S {
  const own = schema.blocks ?? {};
  const shared: Record<string, Block> = {};
  for (const [name, block] of Object.entries(own)) shared[name] = { ...block };

  const linkFields = (fields: Fields, at: string): Fields =>
    Object.fromEntries(Object.entries(fields).map(([key, f]) => [key, link(f, `${at}.${key}`)]));
  const link = (f: Field, at: string): Field => {
    if (f.type === "group" || f.type === "array") return { ...f, fields: linkFields(f.fields, at) };
    if (f.type !== "blocks") return f;
    const named = Array.isArray(f.blocks) ? f.blocks.map((n) => [n, n]) : Object.entries(f.blocks);
    const blocks = named.map(([key, b]) => {
      if (typeof b !== "string")
        return [key, { ...b, fields: linkFields(b.fields, `${at}.${key}`) }];
      if (!Object.hasOwn(shared, b))
        throw new Error(`tenoncms: blocks "${at}.${key}" names an unknown shared block "${b}"`);
      return [key, shared[b]];
    });
    return { ...f, blocks: Object.fromEntries(blocks) };
  };
  const linkOwners = <T extends { fields: Fields }>(owners: Record<string, T> = {}) =>
    Object.fromEntries(
      Object.entries(owners).map(([name, o]) => [
        name,
        { ...o, fields: linkFields(o.fields, name) },
      ]),
    );

  for (const [name, block] of Object.entries(own))
    shared[name].fields = linkFields(block.fields, `blocks.${name}`);
  return {
    ...schema,
    collections: linkOwners(schema.collections),
    globals: linkOwners(schema.globals),
    blocks: shared,
  };
}
