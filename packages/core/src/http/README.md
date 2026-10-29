# http

The `/_tenon` API on Hono. It mounts the feature endpoints in a fixed middleware order and offers the helpers they share: body parsing, read options, query filters, caller lookup and error mapping. It does not validate content or run hooks; handlers call the scoped local API, and the operations do that.

Endpoints live in their feature folders: `../collections/endpoints/`, `../globals/endpoints/`, `../media/endpoints/`, `/schema` in `../schema/endpoints/read.endpoint.ts` and the preview cookie in `../preview/endpoints/`. Sessions live in `../auth/`; plugin mounting and middleware collection live in `../plugins/http/`.

## Follow a request

`createApp()` in `app.ts` runs every request through:

```
withCms → plugins' publicMiddleware → auth/* or open routes
        → csrf (skipped with an API key) → optionalSession → content reads
        → plugins' middleware (with a session) → content writes
        → session → apiKeyReach → protected routes
```

`withCms` binds the local API without a user, so public plugin middleware and routes get it. The open routes come next: auth status, invites, `/localization`, public plugin routes and media files. They look up no caller; media files do it themselves, and only when a read rule exists. `optionalSession` looks up the caller once for every route below it: it sets `perspective`, a scoped `cms`, `user` with a session and `apiKey` with an API key. Content reads (collections, globals, media folders) and content writes come next, so their access rules decide (see `../access/`). Everything after `session` needs a session or a key; `apiKeyReach()` lets a key reach only `/schema` there, with `read` on `schema`. `handleError()` turns thrown errors into JSON responses, `ForbiddenError` into 401 or 403.

## Follow a public read

`find.endpoint.ts` flows through:

`../auth/middleware/session.middleware.ts` → `query/where-from-query.ts` → `query/read-options.ts` → local API

`optionalSession()` picks the caller and perspective. `whereFromQuery()` turns the remaining query keys into equality filters. `readOptions()` parses `populate`, `depth` and `select` through `parse-populate.ts` and `parse-select.ts`. The local API applies the access rules, so the response is what the caller MAY read.

## Files

| Path                                | Responsibility                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `index.ts`                          | Exports `createApp()`.                                                                                            |
| `app.ts`                            | `createApp()`: mounts open, content and protected routes in order.                                                |
| `errors.ts`                         | `notFound()` and `handleError()`, which hides unexpected messages.                                                |
| `parse-body.ts`                     | `parseBody()`: JSON bodies; malformed JSON reads as `undefined`.                                                  |
| `middleware/types.ts`               | `Env`: the Hono context variables `cms`, `user` and `perspective`.                                                |
| `middleware/with-cms.middleware.ts` | `withCms()`: binds the userless local API.                                                                        |
| `query/read-options.ts`             | `readOptions()`: `populate`, `depth`, `select`, `locale`, `fallback` and `alternates`, or a 400 message.          |
| `query/parse-populate.ts`           | `parsePopulate()`: checks paths and hops against the schema. Groups, arrays, blocks and block names count no hop. |
| `query/parse-select.ts`             | `parseSelect()`: the selection tree; `badSelectPath()` checks its keys.                                           |
| `query/path-tree.ts`                | `treeOf()`: dot paths to a null-prototype tree.                                                                   |
| `query/where-from-query.ts`         | `whereFromQuery()`: query keys to typed equality filters.                                                         |

Reads are public unless a read rule says otherwise; the preview cookie reads drafts only with a valid session. Content writes MUST stay behind CSRF and run their access rules; every other write MUST stay behind the session check. HTTP scopes never set `overrideAccess`. Query trees MUST use null-prototype nodes, so a `__proto__` segment cannot pollute `Object.prototype`. Media parses its own bodies and keeps `{}` for malformed JSON.
