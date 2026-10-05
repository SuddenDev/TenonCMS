# plugins

| Path                         | What it does                                                       |
| ---------------------------- | ------------------------------------------------------------------ |
| `index.ts`                   | Public export barrel.                                              |
| `types.ts`                   | Plugin configuration and public/protected Hono environments.       |
| `define-plugin.ts`           | Preserves literal collection and global types.                     |
| `merge-plugins.ts`           | Merges schema definitions and rejects duplicate or reserved names. |
| `http/mount-routes.ts`       | Mounts each plugin's routes under its name, in plugin order.       |
| `http/collect-middleware.ts` | Collects public or protected middleware in plugin order.           |
| `redirects/`                 | The bundled redirects plugin and admin page.                       |

Plugins can provide collections, globals, hooks, media hooks, routes, middleware and admin bar items (`adminBar.items`, run in plugin order before the host's hook; see [preview](../preview/README.md#admin-bar)). Public routes run before CSRF/session checks, so plugins MUST enforce any protection their public writes require. Protected routes and middleware receive the session user and scoped CMS API. Bundled plugins MUST use public exports.
