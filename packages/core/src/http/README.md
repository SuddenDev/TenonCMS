# http

The `/api/cms` API on Hono. It mounts the feature endpoints in a fixed middleware order and offers the helpers they share: body parsing, read options, query filters, caller lookup, private field stripping and error mapping. It does not validate content or run hooks; handlers call the scoped local API, and the operations do that.

Endpoints live in their feature folders: `../collections/endpoints/`, `../globals/endpoints/`, `../media/endpoints/`, `/schema` in `../schema/endpoints/read.endpoint.ts` and the preview cookie in `../preview/endpoints/`. Sessions live in `../auth/`; plugin mounting and middleware collection live in `../plugins/http/`.

## Follow a request

`createApp()` in `app.ts` runs every request through:

```
withCms → plugins' publicMiddleware → auth/* or public reads
        → csrf → session → plugins' middleware → protected routes
```

`withCms` binds the local API without a user, so public plugin middleware and routes get it. Public reads come next: they need no session, so they call `readRequest()` to look up the caller themselves. Everything after `csrf` and `session` needs a session; the session middleware sets `user` and a scoped `cms`. `handleError()` turns thrown errors into JSON responses.

## Follow a public read

`find.endpoint.ts` flows through:

`read-request.ts` → `query/where-from-query.ts` → `query/read-options.ts` → local API → `strip-private-fields.ts`

`readRequest()` picks the caller's visibility and perspective. `whereFromQuery()` turns the remaining query keys into equality filters. `readOptions()` parses `populate`, `depth` and `select` through `parse-populate.ts` and `parse-select.ts`. `stripPrivateFields()` removes what the caller cannot see from the selected result.

## Files

| Path                                | Responsibility                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `index.ts`                          | Exports `createApp()`.                                                                                   |
| `app.ts`                            | `createApp()`: mounts public and protected routes in order.                                              |
| `errors.ts`                         | `notFound()` and `handleError()`, which hides unexpected messages.                                       |
| `parse-body.ts`                     | `parseBody()`: JSON bodies; malformed JSON reads as `undefined`.                                         |
| `read-request.ts`                   | `readRequest()`: visibility and scoped local API of a public read.                                       |
| `strip-private-fields.ts`           | `stripPrivateFields()`: removes private fields, also in groups, relations and joins.                     |
| `visibility.ts`                     | `Visibility` (`public` / `admin`) and `visible()`.                                                       |
| `middleware/types.ts`               | `Env`: the Hono context variables `cms` and `user`.                                                      |
| `middleware/with-cms.middleware.ts` | `withCms()`: binds the userless local API.                                                               |
| `query/read-options.ts`             | `readOptions()`: `populate`, `depth`, `select`, `locale`, `fallback` and `alternates`, or a 400 message. |
| `query/parse-populate.ts`           | `parsePopulate()`: checks paths and hops against the schema.                                             |
| `query/parse-select.ts`             | `parseSelect()`: the selection tree; `badSelectPath()` checks its keys.                                  |
| `query/path-tree.ts`                | `treeOf()`: dot paths to a null-prototype tree.                                                          |
| `query/where-from-query.ts`         | `whereFromQuery()`: query keys to typed equality filters.                                                |

Reads are public. A session sees private fields; the preview cookie reads drafts only with a valid session. Writes MUST stay behind the CSRF and session checks. Private fields cannot be public filters, and public responses are stripped after selection. Query trees MUST use null-prototype nodes, so a `__proto__` segment cannot pollute `Object.prototype`. Media parses its own bodies and keeps `{}` for malformed JSON.
