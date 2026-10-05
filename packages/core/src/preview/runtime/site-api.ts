import type { ServerAdminBarItem } from "../../admin/index.d.ts";

// `API_BASE` of the client. Importing it would pull core code into the browser entry.
const API = "/api/cms";
const COOKIE = "integral-preview";
// `SESSION_HINT` of the auth middleware, repeated so no server code reaches the browser entry.
const HINT = "integral-session";

/** What the CMS answers for the admin bar of a page. */
export type AdminBarData = { position: "top" | "bottom"; items: ServerAdminBarItem[] };

/** The perspective the preview cookie selects: `drafts`, else `published`. */
export const perspective = () =>
  document.cookie.split(";").some((c) => c.trim() === `${COOKIE}=drafts`) ? "drafts" : "published";

/** Whether the session hint cookie is set. It only says that asking for the admin bar is worth a request. */
export const hasSessionHint = () => new RegExp(`(^|;\\s*)${HINT}=[^;]`).test(document.cookie);

/** Removes the session hint, e.g. after the session expired. */
export const clearSessionHint = () => {
  document.cookie = `${HINT}=; max-age=0; path=/`;
};

/**
 * Asks the CMS for the admin bar of the page at `url`.
 * @returns `"unauthorized"` without a valid session, `null` on any other error.
 */
export const loadAdminBar = (url: string): Promise<AdminBarData | "unauthorized" | null> =>
  fetch(`${API}/admin-bar?url=${encodeURIComponent(url)}`, { credentials: "same-origin" })
    .then((res) => (res.status === 401 ? "unauthorized" : res.ok ? res.json() : null))
    .catch(() => null);

/** Sets the preview cookie through the CMS, then reloads the page. */
export async function setPerspective(value: "drafts" | "published") {
  await fetch(`${API}/preview`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ perspective: value }),
  });
  location.reload();
}
