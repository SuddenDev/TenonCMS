import { getCookies, parseSetCookieHeader, stripSecureCookiePrefix } from "better-auth/cookies";
import type { MiddlewareHandler } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";

/** A cookie page code can read: `1` while the browser holds a session cookie. It grants nothing. */
export const SESSION_HINT = "tenon-session";

/**
 * Mirrors better-auth's session cookie in each auth response: a set session cookie sets the hint, a cleared one
 * clears it. The session cookie is `HttpOnly`, so the site's preview runtime reads the hint to decide whether to
 * ask for the admin bar.
 */
export function sessionHint(core: Core): MiddlewareHandler<Env> {
  return async (c, next) => {
    await next();
    const header = c.res.headers.get("set-cookie");
    if (!header) return;

    // The secure prefix depends on the request's protocol, so names are compared without it.
    const name = stripSecureCookiePrefix(getCookies((await core.auth()).options).sessionToken.name);
    const session = [...parseSetCookieHeader(header)].find(
      ([cookie]) => stripSecureCookiePrefix(cookie) === name,
    )?.[1];
    if (!session) return;

    const expired =
      !session.value ||
      (session["max-age"] !== undefined && session["max-age"] <= 0) ||
      (session.expires !== undefined && session.expires.getTime() <= Date.now());
    if (expired) return void deleteCookie(c, SESSION_HINT, { path: "/" });

    // The hint MUST live as long as the session, or a restarted browser keeps a session without a bar.
    setCookie(c, SESSION_HINT, "1", {
      maxAge: session["max-age"],
      expires: session.expires,
      path: "/",
      sameSite: "Lax",
      secure: session.secure,
    });
  };
}
