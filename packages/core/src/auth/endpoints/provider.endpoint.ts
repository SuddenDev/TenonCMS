import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";

export const providerEndpoint = (core: Core) =>
  new Hono<Env>().on(["GET", "POST"], "/auth/*", async (c) =>
    (await core.auth()).handler(c.req.raw),
  );
