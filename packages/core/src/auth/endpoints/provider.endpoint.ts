import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";

export const providerEndpoint = (cms: Cms<Schema>) =>
  new Hono<Env>().on(["GET", "POST"], "/auth/*", async (c) =>
    (await cms.auth()).handler(c.req.raw),
  );
