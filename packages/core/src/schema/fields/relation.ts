import { z } from "zod";
import type { Base } from "./common.ts";

export type RelationField = Base<unknown, string | string[]> & {
  /** Stores the id of a document in `collection`. Reads resolve it to the document, see `populate`. */
  type: "relation";
  /** Name of the collection the ids point to. It MAY be the collection that holds this field. */
  collection: string;
  /** Store an array of ids instead of one id. Not filterable. With `required`, at least one id. */
  many?: boolean;
  /**
   * What happens to this field when the referenced document is deleted:
   * - `'set-null'`: this field becomes `null`; in a `many` relation, the id is removed from the array.
   * - `'restrict'`: the delete fails with 409 and lists the referencing documents. Nothing changes.
   * - `'cascade'`: this document is deleted too, with its own `onDelete` rules. Not allowed in globals.
   *
   * Default: `'restrict'` when `required`, else `'set-null'`. `required` with `'set-null'` is not allowed.
   */
  onDelete?: "set-null" | "restrict" | "cascade";
};

// Also the validator of `image` and `file`, which store media ids.
export function relationSchema(
  field: { many?: boolean; required?: boolean },
  on: boolean,
): z.ZodType {
  const id = z.string().min(1);
  if (!field.many) return id;
  const ids = z.array(id).refine((a) => new Set(a).size === a.length, "Duplicate id");
  return on && field.required ? ids.min(1) : ids;
}
