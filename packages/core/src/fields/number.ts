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
};

export function numberSchema(field: NumberField, on: boolean): z.ZodType {
  let s = z.number();
  if (on && field.min !== undefined) s = s.min(field.min);
  if (on && field.max !== undefined) s = s.max(field.max);
  return s;
}
