import type { AdminBarPosition, AdminDescriptor } from "../../admin/index.d.ts";
import { currentAdminLocale } from "../../admin/browser/locale.ts";
import type { ResolvedBarItem } from "../../admin/load/resolve-bar-item.ts";

// `API_BASE` of the client. Importing it would pull core code into the browser entry.
const API = "/_tenon";
const COOKIE = "tenon-preview";
// `SESSION_HINT` of the auth middleware, repeated so no server code reaches the browser entry.
const HINT = "tenon-session";

/** What the CMS answers for the admin bar of a page. */
export type AdminBarData = {
  position: AdminBarPosition;
  items: ResolvedBarItem[];
  branding?: Pick<AdminDescriptor, "name" | "logo" | "icon">;
};

/** The perspective the preview cookie selects: `drafts`, else `published`. */
export const perspective = () =>
  document.cookie.split(";").some((c) => c.trim() === `${COOKIE}=drafts`) ? "drafts" : "published";

/** Whether the session hint cookie is set. It only says that asking for the admin bar is worth a request. */
export const hasSessionHint = (cookie = document.cookie) =>
  new RegExp(`(^|;\\s*)${HINT}=[^;]`).test(cookie);

/** Removes the session hint, e.g. after the session expired. */
export const clearSessionHint = () => {
  document.cookie = `${HINT}=; max-age=0; path=/`;
};

/**
 * Asks the CMS for the admin bar of a page.
 * @param page Path and query of the page, e.g. `/posts/1?lang=de`.
 * @param admin The `admin` option. The CMS runs on its origin.
 * @returns `"unauthorized"` without a valid session, `null` on any other error.
 */
export const loadAdminBar = (
  page: string,
  mode: "site" | "preview-tab",
  admin: string,
): Promise<AdminBarData | "unauthorized" | null> => {
  const { base, credentials } = cmsApi(admin);
  return fetch(
    `${base}/admin-bar?url=${encodeURIComponent(page)}&mode=${mode}&locale=${currentAdminLocale()}`,
    { credentials },
  )
    .then((res) => (res.status === 401 ? "unauthorized" : res.ok ? res.json() : null))
    .catch(() => null);
};

/**
 * Runs the server `load` of one bar item again.
 * @param id The id of the item or of a dropdown child.
 * @param admin The `admin` option. The CMS runs on its origin.
 * @returns The new item, `null` when the item is hidden now. `"unauthorized"` without a valid session. Throws on
 * any other error.
 */
export async function loadAdminBarItem(
  id: string,
  page: string,
  admin: string,
): Promise<{ item: ResolvedBarItem | null } | "unauthorized"> {
  const { base, credentials } = cmsApi(admin);
  const res = await fetch(`${base}/admin/load`, {
    method: "POST",
    credentials,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "bar-item", id, url: page, locale: currentAdminLocale() }),
  });
  if (res.status === 401) return "unauthorized";
  if (!res.ok) throw new Error(`tenoncms: reloading admin bar item "${id}" failed (${res.status})`);
  return res.json();
}

/**
 * Sets the preview cookie through the CMS, then reloads the page.
 * @param admin The `admin` option. The CMS runs on its origin.
 */
export async function setPerspective(value: "drafts" | "published", admin: string) {
  const { base, credentials } = cmsApi(admin);
  const res = await fetch(`${base}/preview`, {
    method: "POST",
    credentials,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ perspective: value }),
  });
  if (!res.ok) return;
  location.reload();
}

// The API on the admin's origin. On another origin the request MUST send that origin's cookies.
function cmsApi(admin: string): { base: string; credentials: RequestCredentials } {
  const { origin } = new URL(admin, location.href);
  if (origin === location.origin) return { base: API, credentials: "same-origin" };
  return { base: `${origin}${API}`, credentials: "include" };
}
