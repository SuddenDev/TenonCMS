import { z } from "zod";
import type { Base } from "./common.ts";

export type DateTimeField = Base & {
  /** A UTC ISO timestamp (`2026-10-17T12:00:00.000Z`). The admin edits local time. */
  type: "datetime";
  /** Shown in the empty input. */
  placeholder?: string;
};

/** The validator of a `datetime` field: a UTC ISO timestamp. */
export const datetimeSchema = (): z.ZodType => z.iso.datetime();
