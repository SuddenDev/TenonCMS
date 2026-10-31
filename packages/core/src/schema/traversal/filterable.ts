import { type Fields } from "../index.ts";

/**
 * Checks whether `where` accepts `key`. Rich text, links, groups, arrays, blocks, joins and `many` relations, images, files and selects are not filterable.
 * @returns `false` for an unknown key too.
 */
export function filterable(fields: Fields, key: string) {
  if (!Object.hasOwn(fields, key)) return false;

  const field = fields[key];

  return (
    field.type !== "richtext" &&
    field.type !== "link" &&
    field.type !== "group" &&
    field.type !== "array" &&
    field.type !== "blocks" &&
    field.type !== "join" &&
    !("many" in field && field.many)
  );
}
