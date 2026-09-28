import { z } from "zod";
import type { Base } from "./common.ts";

export type BooleanField = Base<boolean> & { type: "boolean" };

export const booleanSchema = (): z.ZodType => z.boolean();
