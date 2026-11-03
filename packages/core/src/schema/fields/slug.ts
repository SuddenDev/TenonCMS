import { z } from "zod";
import { SLUG_PATTERN } from "../../helpers/slugify.ts";
import type { Base } from "./common.ts";

export type SlugField = Base & {
  /**
   * A URL part, stored as a string. A value MUST match `SLUG_PATTERN` (`about-us`); the server and the admin check it.
   * An empty slug is filled from `from`, by the server before `beforeValidate` and by the admin while the editor types.
   */
  type: "slug";
  /**
   * A sibling field. The server fills an empty slug from it on every write. On a new document, the admin fills the slug
   * from it while the editor types, until the slug is edited. A saved slug never changes on its own, so URLs stay stable.
   */
  from?: string;
  /**
   * A sibling `relation` field. The admin shows the selected parent's `path` value before the input, e.g. `/about/`.
   * That prefix is a picker: it lists the related collection without the document itself and its descendants, and
   * writes the choice to the relation field. Without a parent, the prefix is `/`.
   */
  parent?: string;
  /** The field of the parent document that the admin shows as the prefix. Default `'path'`. */
  path?: string;
};

/**
 * The validator of a `slug` field. A value MUST match `SLUG_PATTERN`; an optional slug MAY be empty.
 * @returns A plain string check when `on` is false.
 */
export function slugSchema(field: SlugField, on: boolean): z.ZodType {
  if (!on) return z.string();
  const s = z.string().regex(new RegExp(`^(?:${SLUG_PATTERN})$`, "v"));
  return field.required ? s : z.literal("").or(s);
}
