import { API_BASE } from "../client/constants.ts";

/**
 * Normalizes an admin path to one without a trailing slash: `true` is `/admin`, a path like `/cms/` is `/cms`, `false`
 * is `undefined` (no admin). Core and the adapters share it, so it MUST NOT import Node modules.
 * @throws {Error} For a path with other characters than letters, digits, `-` and `_`, for `/`, and for a path
 * under `API_BASE`.
 */
export function adminPath(admin: boolean | `/${string}` = true) {
  if (admin === false) return;
  const path = admin === true ? "/admin" : `/${admin.replace(/^\/+|\/+$/g, "")}`;

  // The path lands in routes and HTML. The API owns `API_BASE`, and `/` would hide the host's pages.
  if (!/^\/[\w-]+(\/[\w-]+)*$/.test(path) || path === API_BASE || path.startsWith(`${API_BASE}/`)) {
    throw new Error(
      `tenoncms: invalid admin path "${admin}". Use letters, digits, "-" and "_", e.g. "/cms".`,
    );
  }
  return path;
}
