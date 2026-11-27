import { getCookies, parseSetCookieHeader, stripSecureCookiePrefix } from "better-auth/cookies";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Core } from "../../cms/runtime/types.ts";
import type { Env } from "../../http/middleware/types.ts";
import { cookieDomain } from "../cookie-domain.ts";

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

    const domain = await cookieDomain(core);
    const expired =
      !session.value ||
      (session["max-age"] !== undefined && session["max-age"] <= 0) ||
      (session.expires !== undefined && session.expires.getTime() <= Date.now());
    if (expired) return void deleteCookie(c, SESSION_HINT, { path: "/", domain });

    // The hint MUST live as long as the session, or a restarted browser keeps a session without a bar.
    setCookie(c, SESSION_HINT, "1", {
      maxAge: session["max-age"],
      expires: session.expires,
      path: "/",
      domain,
      sameSite: "Lax",
      secure: session.secure,
    });
  };
}

/**
 * Clears the hint when the request carries one. Call it for a 401 without a session: page code cannot clear a hint
 * that has a `Domain`.
 */
export async function clearStaleSessionHint(c: Context<Env>, core: Core): Promise<void> {
  if (!getCookie(c, SESSION_HINT)) return;
  deleteCookie(c, SESSION_HINT, { path: "/", domain: await cookieDomain(core) });
}
