import { z } from "zod";
import type { Base } from "./common.ts";

export type BooleanField = Base<boolean> & {
  type: "boolean";
  /** How the admin shows the input. Default `'checkbox'`. */
  appearance?: "checkbox" | "switch";
};

/** The validator of a `boolean` field. */
export const booleanSchema = (): z.ZodType => z.boolean();
