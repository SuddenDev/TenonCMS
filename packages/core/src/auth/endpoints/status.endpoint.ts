import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { signInMethods } from "../config/sign-in-methods.ts";
import { signUpStatus } from "../sign-up.ts";

/**
 * `GET /auth-status`: whether the first admin is missing, whether a visitor MAY sign up, which sign-in methods are on,
 * and how many digits an email code has. A magic link or email OTP is on only when it can send.
 */
export const statusEndpoint = (core: Core) =>
  new Hono<Env>().get("/auth-status", async (c) => {
    c.header("Cache-Control", "no-store");
    const { options } = await core.auth();
    const emailOtp = options.plugins?.find((p) => p.id === "email-otp");
    return c.json({
      ...(await signUpStatus(await core.db())),
      ...signInMethods(options),
      emailOtpLength: (emailOtp?.options?.otpLength as number | undefined) ?? 6,
    });
  });
