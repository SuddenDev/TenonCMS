import { z } from "zod";
import type { Text } from "../../admin/index.d.ts";
import type { Base } from "./common.ts";

/** One choice of a `select`: the stored value, or the value with its admin label. */
export type SelectOption = string | { value: string; label: Text };

export type SelectField = Base<string | string[]> & {
  type: "select";
  /** The allowed values. The stored value is one of them, or an array of them with `many`. */
  options: readonly SelectOption[];
  /** Store an array of distinct values instead of one. Not filterable and not `unique`. With `required`, at least one value. */
  many?: boolean;
  /**
   * How the admin shows the choices. Default `'dropdown'`.
   * - `'dropdown'`: a select menu. With `many`, a combobox with the chosen values as chips.
   * - `'list'`: radio buttons, or checkboxes with `many`. For a few options.
   * - `'buttons'`: a row of toggle buttons. For two to five short options.
   */
  appearance?: "dropdown" | "list" | "buttons";
};

/** The stored value of an option. */
export const optionValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);

/**
 * The validator of a `select` field: one of its `options`, or an array of distinct ones with `many`.
 * @returns A check that skips `required` when `on` is false.
 */
export function selectSchema(field: SelectField, on: boolean): z.ZodType {
  const value = z.enum(field.options.map(optionValue) as [string, ...string[]]);
  if (!field.many) return value;
  const values = z.array(value).refine((a) => new Set(a).size === a.length, "Duplicate value");
  return on && field.required ? values.min(1) : values;
}
