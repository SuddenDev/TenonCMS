import type { Field, Fields } from "../index.ts";

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

/** Whether a field is an array or blocks field, or a group that holds one through groups. */
export const holdsList = (f: Field): boolean =>
  f.type === "array" ||
  f.type === "blocks" ||
  (f.type === "group" && Object.values(f.fields).some(holdsList));

/**
 * Finds the localized top-level fields whose item structure MAY be the same in every locale.
 * @returns The fields by key, or `{}` for an entry that is not localized.
 */
export function structureFields(entry: { localized?: boolean; fields: Fields }) {
  return Object.fromEntries(
    localizedKeys(entry)
      .map((key) => [key, entry.fields[key]] as const)
      .filter(([, f]) => holdsList(f)),
  ) as Record<string, Field>;
}
