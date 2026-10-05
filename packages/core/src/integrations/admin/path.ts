import { API_BASE } from "../../client/constants.ts";
import type { AdminOption } from "./types.ts";

/**
 * Normalizes {@link AdminOption} to a path without a trailing slash, or `undefined` when there is no admin.
 * @throws {Error} For a path with other characters than letters, digits, `-` and `_`, for `/`, and for a path
 * under `API_BASE`.
 */
export function adminPath(admin: AdminOption = true) {
  if (admin === false) return;
  const path = admin === true ? "/admin" : `/${admin.replace(/^\/+|\/+$/g, "")}`;

  // The path lands in routes and HTML. The API owns `API_BASE`, and `/` would hide the host's pages.
  if (!/^\/[\w-]+(\/[\w-]+)*$/.test(path) || path === API_BASE || path.startsWith(`${API_BASE}/`)) {
    throw new Error(
      `integral-cms: invalid admin path "${admin}". Use letters, digits, "-" and "_", e.g. "/cms".`,
    );
  }
  return path;
}
