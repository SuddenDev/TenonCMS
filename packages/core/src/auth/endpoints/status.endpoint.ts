import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { signUpStatus } from "../sign-up.ts";

/**
 * `GET /auth-status`: whether the first admin is missing, whether a visitor MAY sign up, and whether the host added
 * better-auth's `passkey()` plugin.
 */
export const statusEndpoint = (core: Core) =>
  new Hono<Env>().get("/auth-status", async (c) => {
    c.header("Cache-Control", "no-store");
    const { options } = await core.auth();
    const passkeys = !!options.plugins?.some((p) => p.id === "passkey");
    return c.json({ ...(await signUpStatus(await core.db())), passkeys });
  });
