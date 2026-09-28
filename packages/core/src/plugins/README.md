# plugins

| Path         | What it does                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`   | `Plugin`, `definePlugin()` and `mergePlugins()`, which adds the plugins' collections and globals to the schema.                                                    |
| `redirects/` | The bundled redirects plugin: a `redirects` collection, a hook that adds a redirect when a path changes, import and lookup routes, and an admin page (`admin.ts`). |

A plugin can bring collections, globals, hooks, HTTP routes (`routes` behind the session, `publicRoutes` without), Hono middleware (`middleware` behind the session, `publicMiddleware` on every request) and admin pages. Bundled plugins MUST only use the public exports, so a third-party plugin can be written the same way.
