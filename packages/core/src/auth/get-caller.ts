import { API_KEY_HEADER } from "../client/constants.ts";
import type { Caller, Core } from "../cms/runtime/types.ts";
import { ForbiddenError } from "../errors.ts";

/** The cookie that holds the perspective of a signed-in user's reads: `drafts` or `published`. */
export const PREVIEW_COOKIE = "tenon-preview";

/**
 * The caller of a request, and the perspective of its reads.
 * - With an API key: `apiKey` and no user, reading `published`. The key wins over a cookie.
 * - With a session: its user. `drafts` only with the preview cookie set to `drafts`.
 *
 * A request without a key or cookie costs no lookup. A failed session lookup, e.g. with a bad `secret`, counts as none,
 * so public pages keep working.
 * @returns The user, or `null`, the key, and the perspective.
 * @throws {ForbiddenError} 401 for a key that is not valid, so a broken key never reads as a visitor.
 */
export async function caller(
  { getSession, getApiKey }: Pick<Core, "getSession" | "getApiKey">,
  request: Request,
): Promise<Caller> {
  const key = request.headers.get(API_KEY_HEADER);
  if (key) {
    const apiKey = await getApiKey(key);
    if (!apiKey) throw new ForbiddenError(401);
    return { user: null, apiKey, perspective: "published" };
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) return { user: null, perspective: "published" };
  const session = await getSession(request.headers).catch(() => null);
  if (!session) return { user: null, perspective: "published" };
  const drafts = cookie.split(";").some((c) => c.trim() === `${PREVIEW_COOKIE}=drafts`);
  return { user: session.user, perspective: drafts ? "drafts" : "published" };
}
