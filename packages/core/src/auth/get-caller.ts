import type { CmsUser } from "../admin/index.d.ts";
import type { Perspective } from "../cms/runtime/types.ts";

/** The cookie that holds the perspective of a signed-in user's reads: `drafts` or `published`. */
export const PREVIEW_COOKIE = "integral-preview";

/**
 * The session user of a request, and the perspective of its reads: `drafts` only with the preview cookie set to
 * `drafts` and a session. A request without a cookie costs no session lookup. A failed lookup, e.g. with a bad
 * `secret`, counts as none, so public pages keep working.
 * @returns The user, or `null`, and the perspective.
 */
export async function caller(
  getSession: (headers: Headers) => Promise<{ user: CmsUser } | null>,
  request: Request,
): Promise<{ user: CmsUser | null; perspective: Perspective }> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return { user: null, perspective: "published" };
  const session = await getSession(request.headers).catch(() => null);
  if (!session) return { user: null, perspective: "published" };
  const drafts = cookie.split(";").some((c) => c.trim() === `${PREVIEW_COOKIE}=drafts`);
  return { user: session.user, perspective: drafts ? "drafts" : "published" };
}
