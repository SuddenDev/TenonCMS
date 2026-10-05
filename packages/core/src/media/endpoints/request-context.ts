import type { Context } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";

/** The JSON body. A malformed body reads as `{}`, which fails the checks with 400. */
export const body = (req: { json(): Promise<any> }) => req.json().catch(() => ({}));

/** The outer scope of the session user. */
export const scope = (c: Context<Env>) => outerScope(c.var.user);
