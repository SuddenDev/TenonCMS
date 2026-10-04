import type { Field } from "../../schema/index.ts";

/** `public`: a read without a session. `admin`: a request with a session. */
export type Level = "public" | "admin";
export const visible = (f: Field, level: Level) => level === "admin" || !f.private;
