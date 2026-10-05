import { z } from "zod";
import type { Base } from "./common.ts";

export type DateField = Base & {
  /** An ISO date string (`2026-09-24`). */
  type: "date";
  /** Shown in the empty input. */
  placeholder?: string;
};

/** The validator of a `date` field: an ISO date. */
export const dateSchema = (): z.ZodType => z.iso.date();
