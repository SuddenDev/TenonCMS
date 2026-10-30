// This file MUST have type imports only. The admin bundles it.
import type { Block, BlocksField, Fields } from "../index.ts";

/** The blocks of a field of a linked schema (see `linkBlocks()`), where no value is a name any more. */
export const blocksOf = (f: BlocksField) => f.blocks as Record<string, Block>;

/**
 * The blocks of `f` that `seen` does not hold yet. `seen` holds them afterwards. A walk over a schema shares one set, so
 * it visits each block once and ends at a shared block that contains itself.
 * @returns `[key, block]` pairs.
 */
export const unseenBlocks = (f: BlocksField, seen: Set<Block>) =>
  Object.entries(blocksOf(f)).filter(([, b]) => !seen.has(b) && seen.add(b));

/**
 * Whether a block reachable from `fields` contains itself, directly or through other blocks. Its items can then nest
 * without limit, so no list of paths reaches all of them.
 */
export function nestsItself(
  fields: Fields,
  open = new Set<Block>(),
  done = new Set<Block>(),
): boolean {
  return Object.values(fields).some((f) => {
    if (f.type === "group" || f.type === "array") return nestsItself(f.fields, open, done);
    if (f.type !== "blocks") return false;

    return Object.values(blocksOf(f)).some((b) => {
      if (open.has(b)) return true;
      if (done.has(b)) return false;
      open.add(b);
      const found = nestsItself(b.fields, open, done);
      open.delete(b);
      done.add(b);
      return found;
    });
  });
}
