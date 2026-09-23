/** Adapter option for the admin: `true` serves it at `/admin`, a path like `/cms` serves it there, `false` serves none. */
export type AdminOption = boolean | `/${string}`

/** Normalizes {@link AdminOption} to a path without a trailing slash, or `undefined` when there is no admin. */
export function adminPath(admin: AdminOption = true) {
  if (admin === false) return
  const path = admin === true ? '/admin' : `/${admin.replace(/^\/+|\/+$/g, '')}`
  // The path lands in routes and HTML. The API owns `/api/cms`, and `/` would hide the host's pages.
  if (!/^\/[\w-]+(\/[\w-]+)*$/.test(path) || path === '/api/cms' || path.startsWith('/api/cms/')) {
    throw new Error(`integral-cms: invalid admin path "${admin}". Use letters, digits, "-" and "_", e.g. "/cms".`)
  }
  return path
}

/** The standalone admin page. `head` holds the script and style tags of the admin's client entry. */
export function adminHtml(head: string, base: string) {
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
</html>`
}
