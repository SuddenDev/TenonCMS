import { isObject } from "../condition.ts";
import type { Step } from "./relation-paths.ts";

/** One place a path reaches: the value is `parent[key]`, at the positional path `at` (`links.2.page`). */
export type Holder = { parent: Record<string, any>; key: string; at: string };

/**
 * Finds every object that a path reaches in `data`, one per item for each {@link Each} step. A string step into a
 * list takes the item at that index. Missing or `null` values, values that are not lists at an `Each`, and items
 * that are not objects or of another block type are skipped.
 * @returns The holders in data order. Writes to `parent[key]` change `data`.
 */
export function holdersAt(data: unknown, path: Step[], prefix = ""): Holder[] {
  if (!isObject(data) && !Array.isArray(data)) return [];
  const [key, next, ...rest] = path as [string, Step?, ...Step[]];
  const at = prefix + key;
  if (next === undefined) return [{ parent: data as Record<string, any>, key, at }];
  if (typeof next === "string")
    return holdersAt((data as Record<string, any>)[key], [next, ...rest], `${at}.`);

  const items = (data as Record<string, any>)[key];
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, i) =>
    next.blockType !== undefined && item?.blockType !== next.blockType
      ? []
      : holdersAt(item, rest, `${at}.${i}.`),
  );
}
