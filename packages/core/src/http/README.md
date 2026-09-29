# http

The `/api/cms` API, built with Hono. `cms.fetch(request)` calls it. It does not validate or run hooks itself; it passes every call to the local API.

| File            | What it does                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`      | `createApp()`: auth routes, public read routes, then CSRF + session, then write routes and plugin routes. Mounts `media/http.ts` at `/media`. Maps errors to status codes.    |
| `middleware.ts` | Core's Hono middleware: `withCms()` sets `c.var.cms`, `session()` answers 401 without a session and sets `c.var.user`. `pluginMiddleware()` collects the plugins' middleware. |
| `query.ts`      | Turns query strings into read options: `?populate=`, `?depth=`, `?select=`, and field filters (`?featured=true`).                                                             |

Order of one request:

```
withCms → plugins' publicMiddleware → auth/* or public reads
        → csrf → session → plugins' middleware → writes, /schema, plugin routes
```

Rules that only exist here:

- Reads are public, writes need a session.
- Fields marked `private` are removed from public responses and cannot be filtered on.
