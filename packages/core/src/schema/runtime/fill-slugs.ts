import { type Fields } from "../index.ts";
import { eachField } from "../traversal/each-field.ts";
import { slugify } from "../../helpers/slugify.ts";

/**
 * Fills each empty slug from its `from` field, in place. Runs before `beforeValidate`, like the admin's fill.
 * @returns A promise that settles once every slug is set.
 */
export function fillSlugs(fields: Fields, data: Record<string, unknown>) {
  return eachField(fields, data, (key, f, siblings) => {
    if (f.type === "slug" && f.from && !siblings[key] && siblings[f.from])
      siblings[key] = slugify(String(siblings[f.from]));
  });
}
