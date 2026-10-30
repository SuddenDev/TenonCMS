import { type Block, type Fields, type RefField } from "../index.ts";
import { blocksOf } from "./blocks-of.ts";
import { isRef } from "./reference-fields.ts";

/** A step into every item of an array, or with `blockType` into every item of that block type. */
export type Each = { each: true; blockType?: string };

/** One step of a path through the data: an object key or the items of a list. */
export type Step = string | Each;

/**
 * Finds every `relation`, `image` and `file` at the top level, inside groups, array items and block items.
 * A block inside itself is not entered again, so where `nestsItself()` is true the paths miss the
 * deeper items.
 * @returns Each field with its path, in field order, one path per block. The first step is always a top-level key.
 */
export function relationPaths(
  fields: Fields,
  prefix: Step[] = [],
  open: Block[] = [],
): { path: Step[]; field: RefField }[] {
  return Object.entries(fields).flatMap(([key, f]) => {
    if (isRef(f)) return [{ path: [...prefix, key], field: f }];
    if (f.type === "group") return relationPaths(f.fields, [...prefix, key], open);
    if (f.type === "array") return relationPaths(f.fields, [...prefix, key, { each: true }], open);
    if (f.type === "blocks")
      return Object.entries(blocksOf(f)).flatMap(([blockType, b]) => {
        if (open.includes(b)) return [];
        return relationPaths(b.fields, [...prefix, key, { each: true, blockType }], [...open, b]);
      });

    return [];
  });
}

/**
 * Renders a path for messages and lookups.
 * @returns E.g. `seo.image`, `links[].page` or `content[hero].image`.
 */
export const pathKey = (path: Step[]) =>
  path
    .map((s) => (typeof s === "string" ? `.${s}` : `[${s.blockType ?? ""}]`))
    .join("")
    .slice(1);

/**
 * Renders a path that steps through no items.
 * @returns The dot path, or `undefined` for a path with an {@link Each}.
 */
export const plainPath = (path: Step[]) =>
  path.every((s) => typeof s === "string") ? path.join(".") : undefined;
