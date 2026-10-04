# http

The `/api/cms` API, built with Hono. `cms.fetch(request)` calls it. It does not validate or run hooks itself; it passes every call to the local API.

| File            | What it does                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`      | `createApp()`: auth routes, public read routes, then CSRF + session, then write routes and plugin routes. Mounts `media/http.ts` at `/media`. Maps errors to status codes.                                                                                               |
| `middleware.ts` | Core's Hono middleware: `withCms()` sets `c.var.cms`, `session()` answers 401 without a session and sets `c.var.user`. `pluginMiddleware()` collects the plugins' middleware. `caller()` looks up a request's user and perspective; `PREVIEW_COOKIE` is the cookie name. |
| `query.ts`      | Turns query strings into read options: `?populate=`, `?depth=`, `?select=`, and field filters (`?featured=true`).                                                                                                                                                        |

Order of one request:

```
withCms → plugins' publicMiddleware → auth/* or public reads
        → csrf → session → plugins' middleware → writes, /schema, plugin routes
```

Rules that only exist here:

- Reads are public, writes need a session.
- Fields marked `private` are removed from public responses and cannot be filtered on.
- A read uses the drafts perspective only with `integral-preview=drafts` and a valid session; the cookie alone grants nothing. `POST /preview` sets it to the body's `perspective` (`drafts`, the default, or `published`; anything else is 400), with `SameSite=Lax` and `Path=/`, not `HttpOnly`, because the preview runtime reads it. `DELETE /preview` clears it. Both need a session.
- Draft routes: `POST /collections/:name/draft` (create, 201), `PUT /collections/:name/:id/draft`, `POST /collections/:name/:id/publish`, `DELETE /collections/:name/:id/draft` (discard: the published document, or 204 when a never-published one is deleted), and `PUT /globals/:name/draft`, `POST /globals/:name/publish`, `DELETE /globals/:name/draft`.
- `/schema` sends `preview: true` for a collection or global with `preview`, never the template or function. `POST /collections/:name/preview-url` and `POST /globals/:name/preview-url` resolve it from the form state in the body (`{ url }`, 404 without `preview`).
