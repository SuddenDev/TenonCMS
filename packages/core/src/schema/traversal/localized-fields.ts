import type { Fields } from "../index.ts";

/**
 * Finds the top-level keys whose values live in locale rows. A group is one key, localized as a whole.
 * Joins are not stored, so they are never keys.
 * @returns The keys, or `[]` for an entry that is not localized.
 */
export function localizedKeys(entry: { localized?: boolean; fields: Fields }) {
  if (!entry.localized) return [];
  return Object.entries(entry.fields)
    .filter(([, f]) => f.type !== "join" && f.localized !== false)
    .map(([key]) => key);
}
