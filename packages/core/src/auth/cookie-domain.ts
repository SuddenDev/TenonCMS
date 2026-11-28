import { getCookies } from "better-auth/cookies";
import type { Core } from "../cms/runtime/types.ts";

/**
 * The `Domain` of better-auth's session cookie, set by `advanced.crossSubDomainCookies` or the cookie attributes.
 * Core's cookies for the site (the session hint, the preview cookie) MUST use it when they are set and when they are
 * cleared, so page code sees them wherever the session cookie goes.
 * @returns The domain, or `undefined` for a host-only cookie.
 */
export async function cookieDomain(core: Pick<Core, "auth">): Promise<string | undefined> {
  return getCookies((await core.auth()).options).sessionToken.attributes.domain;
}
