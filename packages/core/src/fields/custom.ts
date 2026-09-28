import { z } from "zod";
import type { Base } from "./common.ts";

export type CustomField = Base & {
  /** Stored as a string. The admin renders it with the input registered under the name, e.g. `custom:color` → `fields.color`. */
  type: `custom:${string}`;
};

export const customSchema = (field: CustomField, on: boolean): z.ZodType =>
  on && field.required ? z.string().min(1) : z.string();
