import type { Context } from "hono";
import type { Env } from "../../http/middleware/types.ts";

// A malformed body reads as `{}`, which fails the checks with 400.
export const body = (req: { json(): Promise<any> }) => req.json().catch(() => ({}));

export const scope = (c: Context<Env>) => ({ user: c.var.user, context: {}, nested: false });
