import { z } from "zod";
import type { Base } from "./common.ts";
import { numberSchema, type NumberField } from "./number.ts";

/** The stored value of a `size` field, e.g. `{ value: 100, unit: 'vh' }`. Write it as CSS with `${value}${unit}`. */
export type SizeValue<U extends string = string> = { value: number; unit: U };

/** A number with a CSS unit. `min`, `max` and `step` check the number, like in a `number` field. */
export type SizeField = Base<SizeValue> &
  Pick<NumberField, "placeholder" | "min" | "max" | "step"> & {
    type: "size";
    /** The CSS units the editor MAY pick, e.g. `['px', 'rem', 'vh']`. The first is preselected. */
    units: readonly string[];
  };

/**
 * The validator of a `size` field. The unit MUST be one of `units`, even when `on` is false.
 * @returns A check without `min`, `max` and `step` when `on` is false.
 */
export function sizeSchema(field: SizeField, on: boolean): z.ZodType {
  const { min, max, step } = field;
  return z.object({
    value: numberSchema({ type: "number", min, max, step }, on),
    unit: z.enum(field.units),
  });
}
