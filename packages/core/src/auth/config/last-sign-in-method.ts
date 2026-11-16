import { createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";

/** better-auth's `lastLoginMethod()` cookie, so its client plugin reads it too. */
export const LAST_SIGN_IN_COOKIE = "better-auth.last_used_login_method";

const methods: Record<string, string> = {
  "/sign-in/email": "email",
  "/sign-in/email-otp": "email-otp",
  "/magic-link/verify": "magic-link",
  "/passkey/verify-authentication": "passkey",
};

/**
 * better-auth's `lastLoginMethod()` for core's sign-in methods, without its import of every better-auth plugin. Only
 * the cookie: a column would need an endpoint that tells anyone how an email signs in. A recovery link sets nothing.
 */
export const lastSignInMethod = () =>
  ({
    id: "last-login-method",
    hooks: {
      after: [
        {
          matcher: (ctx) => !!ctx.path && ctx.path in methods,
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.authCookies.sessionToken;
            const signedIn = ctx.context.responseHeaders
              ?.getSetCookie()
              .some((c) => c.startsWith(`${session.name}=`));
            if (!signedIn) return;
            ctx.setCookie(LAST_SIGN_IN_COOKIE, methods[ctx.path]!, {
              ...session.attributes,
              maxAge: 30 * 24 * 60 * 60,
              httpOnly: false,
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
