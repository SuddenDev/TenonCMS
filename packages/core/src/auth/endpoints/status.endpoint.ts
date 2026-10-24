import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { signUpStatus } from "../sign-up.ts";

/** `GET /auth-status`: whether the first admin is missing and whether a visitor MAY sign up. */
export const statusEndpoint = (core: Core) =>
  new Hono<Env>().get("/auth-status", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await signUpStatus(await core.db()));
  });
