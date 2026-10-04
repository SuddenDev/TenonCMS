# http

The `/api/cms` API uses Hono. `index.ts` exports `createApp()` from `app.ts`, which mounts feature endpoints and preserves middleware order. Handlers call the scoped local API; content validation and lifecycle hooks stay in operations.

| Path                                | What it does                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `app.ts`                            | Mounts public plugin/media/content reads, protected schema/preview/plugin/media/content writes, and auth routes. |
| `middleware/types.ts`               | Hono context variables: the CMS API and session user.                                                            |
| `middleware/with-cms.middleware.ts` | Binds the userless API before public plugin middleware.                                                          |
| `read-request.ts`                   | Chooses visibility and draft perspective from the request session.                                               |
| `strip-private-fields.ts`           | Removes private fields recursively, including populated relations and joins.                                     |
| `parse-body.ts`                     | Parses generic JSON bodies; malformed JSON remains `undefined`. Media retains its own parser behavior.           |
| `errors.ts`                         | Creates 404 errors and maps expected errors without exposing unexpected internals.                               |
| `query/`                            | Population, selection, filters, visibility and read options. Shared path trees use null-prototype objects.       |

```
withCms → plugins' publicMiddleware → auth/* or public reads
        → csrf → session → plugins' middleware → protected routes
```

Collection and global endpoint files live in their feature folders. Session handling lives in `../auth/`; plugin mounting and middleware collection live in `../plugins/http/`. `/schema` serialization lives in `../schema/endpoints/read.endpoint.ts`; preview-cookie endpoints live in `../preview/endpoints/`.

Reads remain public; a session permits private fields, and the preview cookie permits drafts only with a valid session. Writes require CSRF and session checks. A malformed body, invalid filter or invalid read option retains its current error response. Public responses filter private fields after selection; private fields cannot be queried as public filters.
