import { z } from "zod";
import type { Base } from "./common.ts";

export type NumberField = Base<number> & {
  type: "number";
  /** Shown in the empty input. */
  placeholder?: string;
  /** Smallest allowed value. */
  min?: number;
  /** Largest allowed value. */
  max?: number;
  /** The value MUST be `min` (or `0`) plus a whole multiple of `step`, like the HTML `step` attribute. Positive. */
  step?: number;
  /**
   * How the admin shows the input. Default `'input'`: a text box with up and down chevrons. `'plain'` has no buttons,
   * `'stepper'` puts minus and plus beside the number, and `'slider'` needs `min` and `max`.
   */
  appearance?: "input" | "plain" | "stepper" | "slider";
};

/**
 * The validator of a `number` field.
 * @returns A plain number check when `on` is false.
 */
export function numberSchema(field: NumberField, on: boolean): z.ZodType {
  let s = z.number();
  if (on && field.min !== undefined) s = s.min(field.min);
  if (on && field.max !== undefined) s = s.max(field.max);
  const { step } = field;
  if (!on || step === undefined) return s;
  const base = field.min ?? 0;
  // Rounds away float noise, so `0.3` counts as three steps of `0.01`.
  return s.refine((v) => {
    const n = (v - base) / step;
    return Math.abs(n - Math.round(n)) < 1e-9;
  }, `Must be a multiple of ${step}`);
}
