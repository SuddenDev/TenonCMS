import { z } from "zod";
import type { Base } from "./common.ts";

export type SelectField = Base & {
  type: "select";
  /** The allowed values. The stored value is one of them. */
  options: readonly string[];
};

export const selectSchema = (field: SelectField): z.ZodType =>
  z.enum(field.options as [string, ...string[]]);
