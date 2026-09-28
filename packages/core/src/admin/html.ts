import { existsSync } from "node:fs";
import { join } from "node:path";
import { API_BASE } from "../client.ts";

/** Adapter option for the admin: `true` serves it at `/admin`, a path like `/cms` serves it there, `false` serves none. */
export type AdminOption = boolean | `/${string}`;

/** Options of the Astro and Nuxt adapters. */
export type Options = {
  /** File that exports the `cms` instance, relative to the project root. Defaults to `./integral.config.ts`. */
  entry?: string;
  /** Path of the admin, e.g. `/cms`. Defaults to `/admin`. `false` leaves only the API (headless). */
  admin?: AdminOption;
};

/** Name of the admin's client entry chunk. */
export const adminChunk = "integral-admin";

/** Vite `configEnvironment` hook that adds the admin entry as a second client input. */
export function adminInput(entry: string) {
  return (name: string) =>
    name === "client"
      ? { build: { rolldownOptions: { input: { [adminChunk]: entry } } } }
      : undefined;
}

/** Target of `#integral/admin`: the host's optional `integral.admin.ts`, else the stub in `adminDir`. */
export function adminAlias(root: string, adminDir: string) {
  const file = join(root, "integral.admin.ts");
  return existsSync(file) ? file : join(adminDir, "default.ts");
}

/** Normalizes {@link AdminOption} to a path without a trailing slash, or `undefined` when there is no admin. */
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

/** The standalone admin page, loading the admin's client entry from `scripts` and `css` URLs. */
export function adminHtml(base: string, scripts: string[], css: string[] = []) {
  const head = [
    ...css.map((href) => `<link rel="stylesheet" href="${href}">`),
    ...scripts.map((src) => `<script type="module" src="${src}"></script>`),
  ].join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Integral CMS - Admin</title>
    ${head}
  </head>
  <body>
    <div id="admin" data-base="${base}"></div>
  </body>
</html>`;
}
