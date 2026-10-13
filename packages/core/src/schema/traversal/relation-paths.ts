import { type Fields, type RefField } from "../index.ts";
import { isRef } from "./reference-fields.ts";

/** A step into every item of an array, or with `blockType` into every item of that block type. */
export type Each = { each: true; blockType?: string };

/** One step of a path through the data: an object key or the items of a list. */
export type Step = string | Each;

/**
 * Finds every `relation`, `image` and `file` at the top level, inside groups, array items and block items.
 * @returns Each field with its path, in field order, one path per block. The first step is always a top-level key.
 */
export function relationPaths(
  fields: Fields,
  prefix: Step[] = [],
): { path: Step[]; field: RefField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    isRef(f)
      ? [{ path: [...prefix, key], field: f }]
      : f.type === "group"
        ? relationPaths(f.fields, [...prefix, key])
        : f.type === "array"
          ? relationPaths(f.fields, [...prefix, key, { each: true }])
          : f.type === "blocks"
            ? Object.entries(f.blocks).flatMap(([blockType, b]) =>
                relationPaths(b.fields, [...prefix, key, { each: true, blockType }]),
              )
            : [],
  );
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
