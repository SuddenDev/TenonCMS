# plugins

| Path                         | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `index.ts`                   | Public export barrel.                                              |
| `types.ts`                   | Plugin configuration and public/protected Hono environments.       |
| `define-plugin.ts`           | Preserves literal collection and global types.                     |
| `merge-plugins.ts`           | Merges schema definitions and rejects duplicate or reserved names. |
| `http/mount-routes.ts`       | Mounts each plugin's routes under its name, in plugin order.       |
| `http/collect-middleware.ts` | Collects public or protected middleware in plugin order.           |

Plugins can provide collections, globals, hooks, media hooks, routes, middleware and admin registrations (`admin`: fields, pages and bar `items`, merged in plugin order before the host's; see [admin](../admin/README.md) and [preview](../preview/README.md#admin-bar)). Public routes run before CSRF/session checks, so plugins MUST enforce any protection their public writes require. Protected routes and middleware receive the session user and scoped CMS API. The bundled plugins (`redirects`, `example`) live in `packages/plugins` and MUST use public exports.

A plugin MAY have no collections or globals and only add `admin`. A plugin never sets the bar `position` or turns the bar off. The name `admin` is reserved, like `account`, `auth`, `auth-status`, `collections`, `globals`, `invites`, `localization`, `media`, `preview` and `schema`.
